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

 import {flatten} from './util.mjs';

'use strict';

export const firebaseConfig = {
  apiKey: "AIzaSyAmC91ijb6UlfRum9i4-3NKPa9PVl1tWz8",
  authDomain: "devwebfeed.firebaseapp.com",
  databaseURL: "https://devwebfeed.firebaseio.com",
  projectId: "devwebfeed",
  storageBucket: "devwebfeed.appspot.com",
  messagingSenderId: "1067674167387"
};

// Note: Prefer RSS feeds over atom. Atom feeds can have <updated> which the
// rss-parser npm package treats as a pub date  :(
export const FEEDS = [
  // Team articles, updates, and blogs.
  // Note: year feeds needed for d.g.c/web b/c default feeds
  // (e.g d.g.c/web/fundamentals/rss.xml) only returns latest 10 items. We want
  // everything for each year.
  ...flatten([2019, 2018, 2017, 2016, 2015].map(year => [
    `https://developers.google.com/web/updates/${year}/rss.xml`,
    `https://developers.google.com/web/fundamentals/${year}/rss.xml`,
    `https://developers.google.com/web/tools/${year}/rss.xml`,
    `https://developers.google.com/web/showcase/${year}/rss.xml`,
    `https://developers.google.com/web/shows/${year}/rss.xml`,
  ])),
  // Note: These don't have per-year feeds and only return the latest items.
  'https://medium.com/feed/dev-channel',
  'https://blog.chromium.org/rss.xml',
  'https://v8.dev/blog.atom',
  'https://v8.dev/features.atom',

  // Personal blogs.
  'https://philipwalton.com/atom.xml',
  'https://ericbidelman.tumblr.com/rss',
  'https://jakearchibald.com/posts.rss',
  'https://paul.kinlan.me/index.xml',
  'https://medium.com/feed/@addyosmani',
  'https://medium.com/feed/@samthor',
  'https://robdodson.me/rss/',
  'https://sgom.es/feed.xml',
  'https://samdutton.wordpress.com/feed/',
  'https://mathiasbynens.be/notes.rss',
  'https://meowni.ca/atom.xml',
  'https://dassur.ma/index.xml',
  'https://jasonformat.com/rss/',
  'https://jeffy.info/feed.xml',
  'https://alankent.me/feed/',
  'https://medinathoughts.com/feed/',
  'https://www.igvita.com/feed/',
  'https://paulbakaus.com/feed/',
  'https://blog.tomayac.com/feed/feed.xml',
  'https://petelepage.com/feed/',

  // Github releases.
  'https://github.com/googlechrome/lighthouse/releases.atom',
  'https://github.com/googlechrome/workbox/releases.atom',
  'https://github.com/googlechrome/puppeteer/releases.atom',
  'https://github.com/GoogleChrome/dialog-polyfill/releases.atom',
  'https://github.com/GoogleChrome/proxy-polyfill/releases.atom',
  // 'https://github.com/googlechromelabs/comlink/releases.atom', // More experimental projects.
  // 'https://github.com/googlechromelabs/clooney/releases.atom',
  // 'https://github.com/googlechromelabs/sw-precache/releases.atom',
];

export const BLOG_TO_AUTHOR = [
  {urlMatcher: 'ericbidelman', author: 'Eric Bidelman', twitter: 'ebidel', github: 'ebidel'},
  {urlMatcher: 'jakearchibald', author: 'Jake Archibald', github: 'jakearchibald', twitter: 'jaffathecake'},
  {urlMatcher: 'paul.kinlan.me', author: 'Paul Kinlan', twitter: 'Paul_Kinlan', github: 'PaulKinlan'},
  {urlMatcher: 'philipwalton', author: 'Philip Walton', twitter: 'philwalton', github: 'philipwalton'},
  {urlMatcher: '@addyosmani', author: 'Addy Osmani', twitter: 'addyosmani'},
  {urlMatcher: 'robdodson', author: 'Rob Dodson', twitter: 'rob_dodson'},
  {urlMatcher: 'mathiasbynens', author: 'Mathias Bynens', twitter: 'mathias'},
  {urlMatcher: 'samdutton', author: 'Sam Dutton', twitter: 'sw12'},
  {urlMatcher: 'developers.google.com', author: 'd.g.c'},
  {urlMatcher: '@samthor', author: 'Sam Thorogood', github: 'samthor'},
  {urlMatcher: 'meowni.ca', author: 'Monica Dinculescu', twitter: 'notwaldorf'},
  {urlMatcher: 'dassur.ma', author: 'Surma', github: 'surma', twitter: 'DasSurma'},
  {urlMatcher: 'github.com/GoogleChromeLabs/', author: 'Google Chrome Labs', twitter: 'ChromiumDev', github: 'GoogleChromeLabs'},
  {urlMatcher: 'github.com/GoogleChrome/', author: 'Google Chrome', twitter: 'ChromiumDev', github: 'GoogleChrome'},
  {urlMatcher: 'medium.com/feed/dev-channel', author: 'Google Chrome', twitter: 'ChromiumDev'},
  {urlMatcher: 'jasonformat.com', author: 'Jason Miller', twitter: '_developit'},
  {urlMatcher: 'jeffy.info', author: 'Jeff Posnick', twitter: 'jeffposnick', github: 'jeffposnick'},
  {urlMatcher: 'blog.tomayac.com', author: 'Thomas Steiner', twitter: 'tomayac', github: 'tomayac'},
  {urlMatcher: 'alankent.me', author: 'Alan Kent', twitter: 'akent99'},
  {urlMatcher: 'medinathoughts.com', author: 'Alberto Medina', twitter: 'iAlbMedina'},
  {urlMatcher: 'igvita.com', author: 'Ilya Grigorik', twitter: 'igrigorik', github: 'igrigorik'},
  {urlMatcher: 'paulbakaus.com', author: 'Paul Bakaus', twitter: 'pbakaus', github: 'pbakaus'},
  {urlMatcher: 'rowan_m', author: 'Rowan Merewood', twitter: 'rowan_m', github: 'rowan-m'},
  {urlMatcher: 'petelepage', author: 'Pete LePage', twitter: 'petele', github: 'petele'},
];

export const YOUTUBE_TO_AUTHOR = [
  {titleMatcher: 'HTTP203', author: 'Surma, Jake Archibald'}, // TODO: handle multiple creators.
  {titleMatcher: 'Supercharged', author: 'Surma'},
  {titleMatcher: 'Polycasts', author: 'Rob Dodson'},
  {titleMatcher: 'A11ycasts', author: 'Rob Dodson'},
  {titleMatcher: 'New in Chrome', author: 'Pete LePage'},
  {titleMatcher: 'New in DevTools', author: 'Kayce Basques'},
  {titleMatcher: 'The Standard', author: 'Sam Thorogood'},
  {titleMatcher: 'Totally Tooling Tips', author: 'Addy Osmani'},
  {titleMatcher: 'Designer vs', author: 'Mustafa Kurtuldu'},
  {titleMatcher: 'State of the Web', author: 'Rick Viscomi'},
];
