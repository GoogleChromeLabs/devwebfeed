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
import rssParser from 'rss-parser';
import {BLOG_TO_AUTHOR, FEEDS} from './shared.mjs';

let FEEDS_CACHE = [];

class Feed {
  constructor(url) {
    this.url = url;
  }

  async update() {
    return new Promise((resolve, reject) => {
      rssParser.parseURL(this.url, (err, resp) => {
        if (err) {
          return reject(err);
        }
        resolve(resp.feed);
      });
    });
  }
}

async function updateFeeds() {
  const promises = [];

  FEEDS.forEach(url => {
    const feed = new Feed(url);
    promises.push(feed.update());
  });

  const results = (await Promise.all(promises)).map(feed => {
    // console.log(feed);

    let author = '';

    // If feed has author, use it.
    if (feed.author && feed.author.name) {
      author = feed.author.name;
    }

    // Fallback. Lookup author.
    const foundAuthor = BLOG_TO_AUTHOR.find((item, i) => feed.link.match(item.urlMatcher));
    if (foundAuthor) {
      author = foundAuthor.author;
    }

    return feed.entries.map(post => {
      // Kill nasty GA tracking params.
      const u = new URL(post.link);
      u.searchParams.delete('utm_campaign');
      u.searchParams.delete('utm_medium');
      u.searchParams.delete('utm_source');
      post.link = u.href;

      // If post has an author, it overrides.
      const creator = post['dc:creator'] || post.creator;
      if (creator) {
        author = creator;
      }

      return {
        title: post.title,
        url: post.link,
        submitted:  (new Date(post.pubDate)).toJSON(),
        submitter: {
          name: 'RSS BOT',
          email: 'RSS',
          picture: 'img/rss_icon_24px.svg'
        },
        author,
        rss: true,
      };
    });
  }).reduce((accum, item) => accum.concat(...item), []);

  FEEDS_CACHE = results;

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
