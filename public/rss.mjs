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

import RSS from 'rss';

class RSSFeed {

  constructor(feedUrl) {
    this.feedUrl = feedUrl;
  }

  create(posts, feedUrl) {
    const feed = new RSS({
      /* eslint-disable camelcase */
      title: 'DevWeb Firehose',
      description: 'Developer resource from Google Web DevRel and from around the web',
      feed_url: this.feedUrl,
      site_url: 'https://devwebfeed.appspot.com/',
      image_url: 'https://devwebfeed.appspot.com/img/firehose.png',
      pubDate: new Date(),
      ttl: 180,// mins for feed to be cached.
      // custom_namespaces: {
      //   content: 'http://purl.org/rss/1.0/modules/content/'
      // }
    });

    posts.forEach(post => {
      feed.item({
        title: post.title,
        author: post.author,
        url: post.url,
        date: post.submitted
        //custom_elements: [{'content:encoded': JSON.stringify(pwa)}]
      });
    });
    /* eslint-enable camelcase */

    return feed.xml({indent: true});
  }
}

export default RSSFeed;
