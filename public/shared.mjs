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

export const firebaseConfig = {
  apiKey: "AIzaSyAmC91ijb6UlfRum9i4-3NKPa9PVl1tWz8",
  authDomain: "devwebfeed.firebaseapp.com",
  databaseURL: "https://devwebfeed.firebaseio.com",
  projectId: "devwebfeed",
  storageBucket: "devwebfeed.appspot.com",
  messagingSenderId: "1067674167387"
};

// Note: Prefer RSS feeds work best because atom feeds can have <updated> which the
// rss-parser npm package treats as a pub date  :\
export const FEEDS = [
  'https://developers.google.com/web/updates/2018/rss.xml',
  'https://developers.google.com/web/updates/2017/rss.xml',
  'https://developers.google.com/web/fundamentals/rss.xml',
  'https://developers.google.com/web/tools/rss.xml', // Note: only last 20 items.
  'https://developers.google.com/web/tools/rss.xml', // Note: only last 20 items.
  'https://developers.google.com/web/shows/rss.xml', // Note: only last 20 items.
  'https://philipwalton.com/atom.xml',
  'https://ericbidelman.tumblr.com/rss',
  'https://jakearchibald.com/posts.rss',
  'https://paul.kinlan.me/index.xml',
  'https://medium.com/feed/dev-channel',
  'https://medium.com/feed/@addyosmani',
  'https://medium.com/feed/@samthor',
  'https://robdodson.me/rss/',
  'https://sgom.es/feed.xml',
  'https://samdutton.wordpress.com/feed/',
  'https://mathiasbynens.be/notes.rss',
  'https://meowni.ca/atom.xml',
  'https://blog.chromium.org/atom.xml', // use atom feed so authors are formatted correctly.
  'https://dassur.ma/index.xml',
  'https://github.com/googlechromelabs/comlink/releases.atom',
  'https://github.com/googlechromelabs/clooney/releases.atom',
  'https://github.com/googlechromelabs/sw-precache/releases.atom',
  'https://github.com/googlechrome/lighthouse/releases.atom',
  'https://github.com/googlechrome/workbox/releases.atom',
  'https://github.com/googlechrome/puppeteer/releases.atom'
];

export const BLOG_TO_AUTHOR = [
  {urlMatcher: 'ericbidelman', author: 'Eric Bidelman', twitter: 'ebidel', github: 'ebidel'},
  {urlMatcher: 'jakearchibald', author: 'Jake Archibald', github: 'jakearchibald', twitter: 'jaffathecake'},
  {urlMatcher: 'paul.kinlan.me', author: 'Paul Kinlan', twitter: 'Paul_Kinlan', github: 'PaulKinlan'},
  {urlMatcher: 'philipwalton', author: 'Philip Walton', twitter: 'philwalton', github: 'philipwalton'},
  {urlMatcher: '@addyosmani', author: 'Addy Osmani'},
  {urlMatcher: 'robdodson', author: 'Rob Dodson'},
  {urlMatcher: 'mathiasbynens', author: 'Mathias Bynens'},
  {urlMatcher: 'samdutton', author: 'Mathias Bynens'},
  {urlMatcher: 'sgom.es', author: 'Sergio Gomes'},
  {urlMatcher: 'developers.google.com', author: 'd.g.c'},
  {urlMatcher: '@samthor', author: 'Sam Thorogood'},
  {urlMatcher: 'meowni.ca', author: 'Monica Dinculescu'},
  {urlMatcher: 'dassur.ma', author: 'Surma'},
  {urlMatcher: 'github.com/GoogleChromeLabs', author: 'Google Chrome Labs', twitter: 'ChromiumDev', gitub: 'googlechromelabs' },
  {urlMatcher: 'github.com/GoogleChrome/', author: 'Google Chrome', twitter: 'ChromiumDev', gitub: 'googlechrome' },
];
