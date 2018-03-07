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
import firebaseAdmin from 'firebase-admin';
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
 *     reuseChrome: Set to false to relaunch a new instance of Chrome on every call. Default is false.
 *     headless: Set to false to launch headlful chrome. Default is true. Note: this param will
 *         have no effect if Chrome was launched at least once with reuseChrome: true.
 *     existingBrowser: existing browser instance to use. `reuseChrome` and `headless`
 *         are ignored if this is present.
 * @return {string} Serialized page output as an html string.
 */
async function ssr(url, {useCache = true, onlyCriticalRequests = true,
                         inlineStyles = true, inlineScripts = true,
                         reuseChrome = false, headless = true,
                         existingBrowser = null} = {}) {
  if (useCache && RENDER_CACHE.has(url)) {
    return RENDER_CACHE.get(url);
  }

  const tic = Date.now();
  // Reuse existing browser instance or launch a new one.
  let browser = existingBrowser;
  if (browser) {
    console.info('Connecting to provided chrome instance.');
    browser = await puppeteer.connect({browserWSEndpoint: await browser.wsEndpoint()});
  } else if (browserWSEndpoint && reuseChrome) {
    console.info('Reusing previously launched chrome instance.');
    browser = await puppeteer.connect({browserWSEndpoint});
  } else {
    browser = await puppeteer.launch({
      args: ['--disable-dev-shm-usage'],
      headless,
    });
    browserWSEndpoint = await browser.wsEndpoint();
  }

  const page = await browser.newPage();

  // const logConsole = msg => {
  //   if (msg.type() === 'error') {
  //     console.log(msg.text());
  //   }
  // };
  // page.on('pageerror', err => console.error('JS error on page!', err)); // log client-side errors in server.
  // page.on('console', logConsole); // log client-side errors in server.

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

      if (url.endsWith('styles.css'))  {
        return req.respond({
          status: 200,
          contentType: 'text/css',
          body: fs.readFileSync('./public/styles.min.css', 'utf-8'),
        });
      }
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
      const sameOriginResource = new URL(href).origin === new URL(url).origin;
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

  try {
    await page.goto(urlToFetch.href, {waitUntil: 'domcontentloaded'});
    await page.waitForSelector('#posts'); // wait for posts to be in filled in page.
  } catch (err) {
    browserWSEndpoint = null;
    console.err(err);
    await browser.close();
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

  // page.removeListener('console', logConsole);

  const html = await page.content(); // Use browser to prerender page, get serialized DOM output!
  if (browserWSEndpoint && reuseChrome || existingBrowser) {
    await page.close(); // Close pages we opened.
  } else if (!existingBrowser) {
    await browser.close(); // Close browser if we created it.
  }
  console.info(`Headless rendered ${url} in: ${Date.now() - tic}ms`);

  RENDER_CACHE.set(url, html); // Cache rendered page.

  return html;
}

async function doSSR(url, req) {
  // Ignore random query params on the URL. Use only the ones we care about.
  url = new URL(url);
  if ('tweets' in req.query) {
    url.searchParams.set('tweets', '');
  }
  if ('year' in req.query) {
    url.searchParams.set('year', req.query.year);
  }

  const html = await ssr(url.href, {
    useCache: 'nocache' in req.query ? false : true,
    inlineStyles: 'noinline' in req.query ? false : true,
    inlineScripts: 'noinline' in req.query ? false : true,
    onlyCriticalRequests: 'noreduce' in req.query ? false : true,
    reuseChrome: 'reusechrome' in req.query ? true : false,
    headless: 'noheadless' in req.query ? false : true,
  });

  return html;
}

dbHelper.setApp(firebaseAdmin.initializeApp({
  // credential: firebaseAdmin.credential.applicationDefault()
  credential: firebaseAdmin.credential.cert(
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

// Handle index.html page dynamically.
app.get('/', async (req, res, next) => {
  // Serve prerendered page to search crawlers.
  if (req.get('User-Agent').match(/googlebot|bingbot/i)) {
    const html = await doSSR(`${req.getOrigin()}/index.html`, req);
    // res.append('Link', `<${url}/styles.css>; rel=preload; as=style`); // Push styles.
    return res.status(200).send(html);
  }
  next();
});


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
  const html = await doSSR(`${req.getOrigin()}/index.html`, req);
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

app.get('/admin/update/rendercache', async (req, res) => {
  if (!req.get('X-Appengine-Cron')) {
    return res.status(403).send('Sorry, handler can only be run from a GAE cron.');
  }

  const browser = await puppeteer.launch({args: ['--disable-dev-shm-usage']});

  const url = new URL(req.getOrigin());

  // Re-render main page and a few years back.
  RENDER_CACHE.clear();
  await ssr(url.href, {useCache: false, existingBrowser: browser});
  await ssr(`${url}?year=${util.currentYear - 1}`, {useCache: false, existingBrowser: browser});
  await ssr(`${url}?year=${util.currentYear - 2}`, {useCache: false, existingBrowser: browser});
  await ssr(`${url}?year=${util.currentYear - 3}`, {useCache: false, existingBrowser: browser});
  await browser.close();

  res.status(200).send('Render cache updated!');
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
  // TODO: figure out way to realtime update tweets and RSS posts.
  // Note: this setups a single realtime monitor (e.g. not one per request).
  dbHelper.monitorRealtimeUpdateToPosts(util.currentYear, async changes => {
    const origin = req.getOrigin();

    // TODO: be more selective. This nukes all cache entries for URLs that
    // match the page's origin.
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
  // feeds.updateFeeds();
  // twitter.updateTweets();

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
