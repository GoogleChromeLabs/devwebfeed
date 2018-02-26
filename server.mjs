/**
 * Copyright 2018 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

import fs from 'fs';
import bodyParser from 'body-parser';
import url from 'url';
const URL = url.URL;
// import stream from 'stream';
import express from 'express';
import firebasedAdmin from 'firebase-admin';
import puppeteer from 'puppeteer';

import Twitter from './public/twitter.mjs';
import * as feeds from './public/feeds.mjs';
import * as util from './public/util.mjs';
import * as dbHelper from './public/firebaseHelper.mjs';

const PORT = process.env.PORT || 8080;
const RENDER_CACHE = new Map(); // Cache of pre-rendered HTML pages.

const twitter = new Twitter('ChromiumDev');

let browserWSEndpoint = null;

// Async route handlers are wrapped with this to catch rejected promise errors.
const catchAsyncErrors = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Server-side renders a URL using headless chrome.
 *
 * Measurements:
 *   - onlyCriticalRequests: true reduces total render time by < 50ms (<2% slowdown)
 *   compared to no optimizations
 *   - inlineStyles: true appears to add negligible overhead.
 *   - TODO: see if these opts actually matter for FMP in the browser, especially on mobile.
 *
 * @param {string} url The url to prerender.
 * @param {!Object} config Optional config settings.
 *     useCache: Whether to consult the cache. Default is true.
 *     inlineStyles: Whether to inline local stylesheets. True by default.
 *     inlineScripts: Whether to inline local scripts. True by default.
 *     onlyCriticalRequests: Reduces the number of requests the
 *         browser makes by aborting requests that are non-critical to rendering
 *         the DOM of the page (stylesheets, images, media). True by default.
 *     reuseChrome: Set to false to relaunch a new isntance of Chrome on every call. Default is false.
 *     headless: Set to false to launch headlful chrome. Default is true. Note: this param will
 *         have no effect if Chrome was launched at least once with reuseChrome: true.
 * @return {string} Serialized page output as an html string.
 */
async function ssr(url, {useCache = true, onlyCriticalRequests = true,
                         inlineStyles = true, inlineScripts = true,
                         reuseChrome = false, headless = true} = {}) {
  if (useCache && RENDER_CACHE.has(url)) {
    return RENDER_CACHE.get(url);
  }

  const tic = Date.now();
  // Reuse existing browser instance or launch a new one.
  let browser;
  if (browserWSEndpoint && reuseChrome) {
    console.info('Reusing existing chrome instance');
    browser = await puppeteer.connect({browserWSEndpoint});
  } else {
    browser = await puppeteer.launch({
      args: ['--disable-dev-shm-usage'],
      headless,
    });
    browserWSEndpoint = await browser.wsEndpoint();
  }

  const page = await browser.newPage();

  await page.setRequestInterception(true);

  const resourcesWhiteList = ['document', 'script', 'xhr', 'fetch', 'websocket'];
  const urlBlackList = [
    '/gtag/js', // Don't load Google Analytics (e.g. inflates page metrics).
  ];

  page.on('request', req => {
    const url = req.url();

    // Prevent some resources from loading.
    if (urlBlackList.find(regex => url.match(regex))) {
      req.abort();
      return;
    }

    // Don't abort CSS requests if we're inlining stylesheets into page. Need
    // their responses.
    if (inlineStyles) {
      resourcesWhiteList.push('stylesheet');
    }

    // Small optimization. We only care about rendered DOM, ignore images, and
    // other media that don't produce markup.
    if (onlyCriticalRequests && !resourcesWhiteList.includes(req.resourceType())) {
      req.abort();
      return;
    }

    req.continue(); // pass through everything else.
  });

  const stylesheetContents = {};
  const scriptsContents = {};

  if (inlineStyles || inlineScripts) {
    page.on('response', async resp => {
      const href = resp.url();
      const type = resp.request().resourceType();
      const sameOriginResource = href.startsWith(url);
      // Only inline local resources.
      if (sameOriginResource) {
        if (type === 'stylesheet') {
          stylesheetContents[href] = await resp.text();
        } else if (type === 'script') {
          scriptsContents[href] = await resp.text();
        }
      }
    });
  }

  // TODO: another optimization might be to take entire page out of rendering
  // path by adding html { display: none } before page loads. However, this may
  // cause any script that looks at layout to fail e.g. IntersectionObserver.

  // Add param so client-side page can know it's being rendered by headless on the server.
  const urlToFetch = new URL(url);
  urlToFetch.searchParams.set('headless', '');

  // await page.evaluateOnNewDocument(() => localStorage.setItem('includeTweets', false));

  try {
    await page.goto(urlToFetch.href, {waitUntil: 'domcontentloaded'});
    await page.waitForSelector('#posts'); // wait for posts to be in filled in page.
  } catch (err) {
    await browser.close();
    browserWSEndpoint = null;
    throw new Error('page.goto/waitForSelector timed out.');
  }

  if (inlineStyles) {
    await page.$$eval('link[rel="stylesheet"]', (sheets, stylesheetContents) => {
      sheets.forEach(link => {
        const css = stylesheetContents[link.href];
        if (css) {
          const style = document.createElement('style');
          style.textContent = css;
          link.replaceWith(style);
        }
      });
    }, stylesheetContents);
  }

  if (inlineScripts) {
    await page.$$eval('script[src]', (scripts, scriptsContents) => {
      scripts.forEach(script => {
        const js = scriptsContents[script.src];
        if (js) {
          const s = document.createElement('script');
          // Note: not using s.text b/c here we don't need to eval the script.
          // That will be done client side when the browser renders the page.
          s.textContent = js;
          s.type = script.getAttribute('type');
          script.replaceWith(s);
        }
      });
    }, scriptsContents);
  }

  const html = await page.content(); // Use browser to prerender page, get serialized DOM output!
  if (browserWSEndpoint && reuseChrome) {
    await page.close();
  } else {
    await browser.close();
  }
  console.info(`Headless rendered page in: ${Date.now() - tic}ms`);

  RENDER_CACHE.set(url, html); // cache rendered page.

  return html;
}

dbHelper.setApp(firebasedAdmin.initializeApp({
  // credential: firebasedAdmin.credential.applicationDefault()
  credential: firebasedAdmin.credential.cert(
      JSON.parse(fs.readFileSync('./serviceAccountKey.json')))
}));

const app = express();

app.use(function forceSSL(req, res, next) {
  const fromCron = req.get('X-Appengine-Cron');
  if (!fromCron && req.hostname !== 'localhost' && req.get('X-Forwarded-Proto') === 'http') {
    return res.redirect(`https://${req.hostname}${req.url}`);
  }
  next();
});

app.use(function addRequestHelpers(req, res, next) {
  req.getCurrentUrl = () => `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  req.getOrigin = () => {
    let protocol = 'https';
    if (req.hostname === 'localhost') {
      protocol = 'http';
    }
    return `${protocol}://${req.get('host')}`;
  };
  next();
});

// app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(express.static('public', {extensions: ['html', 'htm']}));
app.use(express.static('node_modules'));
// app.use(express.static('node_modules/firebase'));
// app.use(function cors(req, res, next) {
//   res.set('Access-Control-Allow-Origin', '*');
//   // res.set('Content-Type', 'application/json;charset=utf-8');
//   // res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
//   next();
// });

// app.get('/stream', async (req, res) => {
//   res.writeHead(200, {
//     'Content-Type': 'text/html',
//     'Cache-Control': 'no-cache',
//     'Connection': 'keep-alive',
//     // 'Access-Control-Allow-Origin': '*',
//     'X-Accel-Buffering': 'no' // Forces Flex App Engine to keep connection open for SSE.
//   });

//   let count = 0;
//   const interval = setInterval(() => {
//     if (count++ === 5) {
//       clearInterval(interval);
//       return res.end();
//     }
//     res.write('This is line #' + count + '\n');
//   }, 1000);

//   res.write('<style>body {color: red;}</style>');
//   res.write('hi\n');

//   // const url = req.getOrigin();
//   // const html = await ssr(url);
//   // return res.status(200).send(html);

//   // const s = new stream.Readable();
//   // s.pipe(res);
//   // s.push(html);
//   // s.push(null);
// });

// Client-side version, 3G Slow:
//   FP: 4s, FCP: 11s
// SSR render, 3G Slow:
//   FP/FCP: 2.3s, 8.37s faster!
app.get('/ssr', catchAsyncErrors(async (req, res) => {
  // This ignores other query params on the URL besides the tweets.
  const url = new URL(req.getOrigin());
  if ('tweets' in req.query) {
    url.searchParams.set('tweets', '');
  }

  const html = await ssr(url.href, {
    useCache: 'nocache' in req.query ? false : true,
    inlineStyles: 'noinline' in req.query ? false : true,
    inlineScripts: 'noinline' in req.query ? false : true,
    onlyCriticalRequests: 'noreduce' in req.query ? false : true,
    reuseChrome: 'reusechrome' in req.query ? true : false,
    headless: 'noheadless' in req.query ? false : true,
  });
  // res.append('Link', `<${url}/styles.css>; rel=preload; as=style`); // Push styles.
  res.status(200).send(html);
}));

app.get('/tweets/:username', async (req, res) => {
  const username = req.params.username;
  res.status(200).json(await twitter.getTweets(username));
});

app.get('/admin/update/feeds', async (req, res) => {
  if (!req.get('X-Appengine-Cron')) {
    return res.status(403).send('Sorry, handler can only be run from a GAE cron.');
  }
  res.status(200).json(await feeds.updateFeeds());
});

app.get('/admin/update/tweets/:username', async (req, res) => {
  if (!req.get('X-Appengine-Cron')) {
    return res.status(403).send('Sorry, handler can only be run from a GAE cron.');
  }
  const username = req.params.username;
  res.status(200).json(await twitter.updateTweets(username));
});

app.post('/posts', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  await dbHelper.newPost(req.body);
  res.status(200).send('Success!');
});

// app.delete('/posts/:year?/:month?/:idx?', async (req, res) => {
//   const year = req.params.year;r
//   const month = req.params.month.padStart(2, '0');
//   const itemsIdx = req.params.idx;
//   await db.deletePost(year, month, itemsIdx);
//   res.status(200).send('Success!');
// });

app.get('/posts/:year?/:month?/:day?', async (req, res) => {
  const year = req.params.year;
  // Pad values if missing leading '0'.
  const month = req.params.month ? req.params.month.padStart(2, '0') : null;
  const day = req.params.day ? req.params.day.padStart(2, '0') : null;
  const maxResults = req.query.maxresults ? Number(req.query.maxresults) : null;

  if (!year) {
    return res.status(400).send({error: 'No year specified.'});
  }

  const rssPosts = await feeds.collectRSSFeeds();
  const posts = await dbHelper.getPosts(year, month, day, rssPosts, maxResults);

  // TODO: monitor updates to other years. e.g. If the server is running when
  // a new year occurs, it will need to be restarted to pick up updates to that
  // new year.
  // Note: this setups a single realtime monitor (e.g. not one per request).
  dbHelper.monitorRealtimeUpdateToPosts(util.currentYear, async changes => {
    const origin = req.getOrigin();
    for (const url of RENDER_CACHE.keys()) {
      if (url.startsWith(origin)) {
        RENDER_CACHE.delete(url);
      }
    }

    // Note: this is wasteful. We're proactively "precaching" the page again so
    // the next time it's requested, first load is fast. Otherwise, the user
    // that loads runs into the cache miss will a pef hit.
    await ssr(origin, {useCache: false});
  });

  res.status(200).send(posts);
});

app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
  console.log('Press Ctrl+C to quit.');

  // async function updatePosts(updateFunction, msTimeout) {
  //   await updateFunction.bind(twitter).call();
  //   setTimeout(updatePosts, msTimeout);
  // }

  // // Warm the caches.
  // // TODO: move to cron.
  // updatePosts(feeds.updateFeeds, 1000 * 60 * 60 * 24); // every 24hrs
  // updatePosts(twitter.updateTweets, 1000 * 60 * 60 * 1); // every 1hrs
});


// Make sure node server process stops if we get a terminating signal.
function processTerminator(sig) {
  if (typeof sig === 'string') {
    process.exit(1);
  }
  console.log('%s: Node server stopped.', Date(Date.now()));
}

['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT',
'SIGBUS', 'SIGFPE', 'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGTERM'
].forEach(sig => {
  process.once(sig, () => processTerminator(sig));
});
