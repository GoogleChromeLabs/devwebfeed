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

import url from 'url';
const URL = url.URL;
import RssParser from 'rss-parser';
import {BLOG_TO_AUTHOR, FEEDS} from './shared.mjs';

let FEEDS_CACHE = [];

class Feed {
  constructor(url) {
    this.url = url;
  }

  async update() {
    return new Promise((resolve, reject) => {
      let parser = new RssParser();
      parser.parseURL(this.url, (err, feed) => {
        if (err) {
          return reject(err);
        }
        resolve(feed);
      });
    });
  }
}

async function updateFeeds() {
  console.info('Updating RSS feeds...');
  const tic = Date.now();

  const promises = [];

  FEEDS.forEach(url => {
    const feed = new Feed(url);
    promises.push(feed.update());
  });

  const results = (await Promise.all(promises)).map(feed => {
    let feedAuthor = '';

    // If feed has author, use it.
    if (feed.author && feed.author.name) {
      feedAuthor = feed.author.name;
    }

    // Fallback. Lookup author.
    const foundAuthor = BLOG_TO_AUTHOR.find((item, i) => feed.link.match(item.urlMatcher));
    if (foundAuthor) {
      feedAuthor = foundAuthor.author;
    }

    return feed.items.map(post => {
      // Kill nasty GA tracking params.
      const u = new URL(post.link);
      u.searchParams.delete('utm_campaign');
      u.searchParams.delete('utm_medium');
      u.searchParams.delete('utm_source');
      post.link = u.href;

      // If post has an author, it overrides the feed author.
      const author = post['dc:creator'] || post.creator;

      return {
        title: post.title,
        url: post.link,
        domain: new URL(post.link).host,
        submitted:  (new Date(post.pubDate)).toJSON(),
        submitter: {
          name: 'RSS bot',
          email: '',
          picture: 'img/rss_icon_24px.svg',
          bot: true,
        },
        author: author || feedAuthor,
      };
    });
  }).reduce((accum, item) => accum.concat(...item), []);

  FEEDS_CACHE = results;

  console.info(`Feed update took ${(Date.now() - tic)/1000}s`);

  return results;
}

/**
 * @return Promise<!Array<!Object>>
 */
function collectRSSFeeds() {
  // Avoid http requests if there are posts in the cache.
  if (FEEDS_CACHE.length) {
    return FEEDS_CACHE;
  }
  return updateFeeds();
}

export {collectRSSFeeds, updateFeeds};
