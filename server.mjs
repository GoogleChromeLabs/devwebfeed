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
import GoogleAnalytics from 'universal-analytics';

import * as prerender from './ssr.mjs';
import Twitter from './public/twitter.mjs';
import * as feeds from './public/feeds.mjs';
import * as util from './public/util.mjs';
import * as dbHelper from './public/firebaseHelper.mjs';
import RSSFeed from './public/rss.mjs';
import * as ga from './analytics.mjs';
import * as ytAnalytics from './analytics-youtube.mjs';

const PORT = process.env.PORT || 8080;
const GA_ACCOUNT = 'UA-114661299-1';
const twitter = new Twitter('ChromiumDev');

// Async route handlers are wrapped with this to catch rejected promise errors.
const catchAsyncErrors = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

async function doSSR(url, req) {
  // Ignore random query params on the URL. Use only the ones we care about.
  url = new URL(url);
  if ('tweets' in req.query) {
    url.searchParams.set('tweets', '');
  }
  if ('year' in req.query) {
    url.searchParams.set('year', req.query.year);
  }

  const html = await prerender.ssr(url.href, {
    useCache: 'nocache' in req.query ? false : true,
    inlineStyles: 'noinline' in req.query ? false : true,
    inlineScripts: 'noinline' in req.query ? false : true,
    onlyCriticalRequests: 'noreduce' in req.query ? false : true,
    reuseChrome: 'reusechrome' in req.query ? true : false,
    headless: 'noheadless' in req.query ? false : true,
  });

  return html;
}

async function getPosts(req, res) {
  const year = req.params.year || util.currentYear;
  // Pad values if missing leading '0'.
  const month = req.params.month ? req.params.month.padStart(2, '0') : null;
  const day = req.params.day ? req.params.day.padStart(2, '0') : null;
  const maxResults = req.query.maxresults ? Number(req.query.maxresults) : null;

  // Record GA pageview.
  const visitor = GoogleAnalytics(GA_ACCOUNT, {https: true});
  visitor.pageview(req.originalUrl).send();

  const rssPosts = await feeds.collectRSSFeeds();
  const posts = util.uniquePosts(
      await dbHelper.getPosts(year, month, day, rssPosts, maxResults));

  return posts;
}

async function addAnalyticsData(posts, uid) {
  try {
    const user = await firebaseAdmin.auth().getUser(uid);
    if (user.customClaims.admin) {
      const urlMap = await ga.updateAnalyticsData();
      const ytVideoIdMap = await ytAnalytics.updateAnalyticsData();

      const titleMap = new Map([
        ...ga.Analytics.toTitleMap(urlMap),
        ...ytAnalytics.YoutubeAnalytics.toTitleMap(ytVideoIdMap),
      ]);

      posts = posts.map(post => {
        const urlMatch = urlMap.get(new URL(post.url).pathname);
        const titleMatch = titleMap.get(post.title);
        const match = urlMatch || titleMatch;
        if (match) {
          // Normalize between GA and YT properties.
          const pageviews = match.pageviews || (match.statistics && match.statistics.viewCount);
          return Object.assign({pageviews}, post);
        }
        return post;
      });
    }
  } catch (err) {
    console.error(err);
    // Noop. Pass through posts without analytics data.
  }

  return posts;
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
  const ua = req.get('User-Agent');
  if (ua && ua.match(/googlebot|bingbot/i)) {
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

// Admin handlers --------------------------------------------------------------
app.post('/admin/user/update/:uid', async (req, res) => {
  const uid = req.params.uid;
  if (!uid) {
    return res.status(400).json({error: 'Missing uid'});
  }
  const user = await firebaseAdmin.auth().getUser(uid);
  const isGoogler = user.email.endsWith('@google.com');
  await firebaseAdmin.auth().setCustomUserClaims(uid, {admin: isGoogler});

  res.status(200).json(user.customClaims || {});
});

app.get('/admin/update/feeds', async (req, res) => {
  if (!req.get('X-Appengine-Cron')) {
    return res.status(403).send('Sorry, handler runs from GAE cron.');
  }
  res.status(200).json(await feeds.updateFeeds());
});

app.get('/admin/update/tweets/:username', async (req, res) => {
  if (!req.get('X-Appengine-Cron')) {
    return res.status(403).send('Sorry, handler runs from GAE cron.');
  }
  const username = req.params.username;
  res.status(200).json(await twitter.updateTweets(username));
});

app.get('/admin/update/analytics', async (req, res) => {
  if (!req.get('X-Appengine-Cron')) {
    return res.status(403).send('Sorry, handler runs from GAE cron.');
  }
  await ga.updateAnalyticsData(true);
  await ytAnalytics.updateAnalyticsData(true);
  res.status(200).send('Done');
});

app.get('/admin/update/rendercache', async (req, res) => {
  if (!req.get('X-Appengine-Cron')) {
    return res.status(403).send('Sorry, handler runs from GAE cron.');
  }

  const browser = await puppeteer.launch({args: ['--disable-dev-shm-usage']});

  const url = new URL(req.getOrigin());

  // Re-render main page and a few years back.
  prerender.clearCache();
  await prerender.ssr(url.href, {useCache: false, existingBrowser: browser});
  await prerender.ssr(`${url}?year=${util.currentYear - 1}`,
      {useCache: false, existingBrowser: browser});
  await prerender.ssr(`${url}?year=${util.currentYear - 2}`,
      {useCache: false, existingBrowser: browser});
  await prerender.ssr(`${url}?year=${util.currentYear - 3}`,
      {useCache: false, existingBrowser: browser});
  await browser.close();

  res.status(200).send('Render cache updated!');
});
// -----------------------------------------------------------------------------

// Client-side version, 3G Slow:
//   FP: 4s, FCP: 11s
// SSR render, 3G Slow:
//   FP/FCP: 2.3s, 8.37s faster!
app.get('/ssr', catchAsyncErrors(async (req, res) => {
  const tic = Date.now();
  const html = await doSSR(`${req.getOrigin()}/index.html`, req);
  res.set('Server-Timing', `Prerender;dur=${Date.now() - tic};desc="Headless render time (ms)"`);
  res.status(200).send(html);
}));

app.get('/tweets/:username', async (req, res) => {
  const username = req.params.username;
  res.status(200).json(await twitter.getTweets(username));
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
  let posts = await getPosts(req, res);

  const format = req.query.format || null;
  if (format === 'rss') {
    const feedUrl = req.getCurrentUrl();
    const xml = (new RSSFeed(feedUrl)).create(posts);
    res.set('Content-Type', 'application/rss+xml');
    return res.status(200).send(xml);
  }

  // Zest in analytics data if user is admin.
  posts = await addAnalyticsData(posts, req.query.uid);

  // TODO: monitor updates to other years. e.g. If the server is running when
  // a new year occurs, it will need to be restarted to pick up updates to that
  // new year.
  // TODO: figure out way to realtime update tweets and RSS posts.
  // Note: this setups a single realtime monitor (e.g. not one per request).
  dbHelper.monitorRealtimeUpdateToPosts(util.currentYear, async changes => {
    const origin = req.getOrigin();
    prerender.deleteCacheItemsFromOrigin(origin);

    // Note: this is wasteful. We're proactively "precaching" the page again so
    // the next time it's requested, first load is fast. Otherwise, the user
    // that loads runs into the cache miss will a pef hit.
    await prerender.ssr(origin, {useCache: false});
  });

  res.status(200).send(posts);
});

app.listen(PORT, async () => {
  console.log(`App listening on port ${PORT}`);
  console.log('Press Ctrl+C to quit.');
  // Initially populate caches on server bootup. In parallel.
  feeds.updateFeeds();
  // twitter.updateTweets();
  ga.updateAnalyticsData();
  ytAnalytics.updateAnalyticsData();
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
