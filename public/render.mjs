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

import {html, render} from './lit-html.js';
import {repeat} from './lib/repeat.js';
import * as util from './util.mjs';

const container = document.querySelector('#container');

function formatDate(dateStr) {
  try {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat(
        'en-US', {year: 'numeric', month: 'short', day: 'numeric'}).format(date);
  } catch (err) {
    console.error(dateStr, err);
  }
}

function groupBySubmittedDate(items) {
  const map = new Map();

  items.forEach(item => {
    const submitted = formatDate(item.submitted);
    if (!map.has(submitted)) {
      map.set(submitted, []);
    }
    map.get(submitted).push(item);
  });

  return Array.from(map.entries());
}

function renderPostIcon(submitter) {
  if (!submitter || !submitter.picture) {
    return '';
  }
  const submitterStr = submitter.email ? `Submitted by ${submitter.email}` : `Auto-submitted by ${submitter.name}`;
  return html`<img src="${submitter.picture}" class="profile_pic" title="${submitterStr}">`;
}

function iconSrc(domain) {
  let src = '';
  if (domain.match('github.com')) {
    src = 'img/github_icon.svg';
  } else if (domain.match('developers.google.com')) {
    src = 'img/wf_icon.png';
  } else if (domain.match('twitter.com')) {
    src = 'img/twitter_icon.png';
  } else if (domain.match('chromium.org')) {
    src = 'img/chromium_logo.svg';
  }
  return src;
}

function renderPosts(items, container) {
  util.sortPosts(items);

  // Group posts by the date they were submitted.
  items = groupBySubmittedDate(items);
  const template = (items) => html`
    <ul id="posts">
      ${repeat(items, (item) => item[1].url, (item, i) => {
        const date = item[0];
        const posts = item[1];

        const postTmplResults = repeat(posts, (post) => item.url, (post, i) => {
          post.domain = new URL(post.url).host;

          if (post.author) {
            post.author = post.author.trim();
          }
          const by = post.author ? `by ${post.author}` : '';

          return html`
            <li class="post layout start" data-domain="${post.domain}" data-submitted-by-bot="${post.submitter.bot || false}">
              <div class="overflow flex layout vertical" title="${post.title}">
                <div class="layout overflow">
                  <a class="post_child post_title" href="${post.url}" target="_blank">${post.title}</a>
                  <span class="post_child post_author clickable"
                        onclick="filterBy('author', '${post.author}')">${by}</span>
                </div>
                <span class="post_child post_domain clickable""
                      onclick="filterBy('domain', '${post.domain}')">
                      <img src="${iconSrc(post.domain)}" class="source_icon">${post.domain}
                </span>
              </div>
              <div class="layout">
                <a href="" class="remove_button" onclick="return handleDelete(this, '${date}', '${post.url}')"
                   title="Remove this post"></a>
                ${renderPostIcon(post.submitter)}
              </div>
            </li>`;
        });

        return html`
          <li class="posts_group">
            <h3 class="post_date">${formatDate(date)}</h3>
            <ol>${postTmplResults}</ol>
          </li>
        `;
      })}
    </ul>
  `;

  render(template(items), container);
}

export {renderPosts, container};
