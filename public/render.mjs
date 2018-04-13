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

import {html, render} from './lit-html/lit-html.js';
import {repeat} from './lit-html/lib/repeat.js';
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
  // Request properly sized images.
  const size = Math.ceil(24 * window.devicePixelRatio);
  if (!submitter.picture.includes(`/s${size}`) && submitter.picture.includes('googleusercontent.com')) {
    const parts = submitter.picture.split('/');
    parts.splice(parts.length - 1, 0, `s${size}-c`);
    submitter.picture = parts.join('/');
  }
  const submitterStr = submitter.email ? `Submitted by ${submitter.email.split('@')[0]}` : `Auto-submitted by ${submitter.name}`;
  return html`<img src="${submitter.picture}" class="post_button profile_pic" title="${submitterStr}">`;
}

function renderPaginationLinks() {
  const params = new URL(location.href).searchParams;
  params.delete('headless');
  const yearView = parseInt(params.get('year') || util.currentYear);

  const newer = yearView + 1;
  const older = yearView - 1;
  const disabled = newer > util.currentYear ? 'disabled' : '';

  const newerLinkParams = new URLSearchParams(params);
  newerLinkParams.set('year', newer);
  const olderLinkParams = new URLSearchParams(params);
  olderLinkParams.set('year', older);

  return html`
    <footer class="pagination layout center-center">
      <a href="?${newerLinkParams.toString()}" class="${disabled}">&larr; Newer</a> |
      <a href="?${olderLinkParams.toString()}">Older &rarr;</a>
    </footer>
    `;
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
  } else if (domain.match('youtu.be') || domain.match('youtube.com')) {
    src = 'img/youtube_64px.png';
  }
  return src;
}

function renderAnalyticsData(post) {
  if (!post.pageviews) {
    return '';
  }

  return html`
    <span class="post_child post_views" title="${post.pageviews} Google Analytics page views" data-views=${post.pageviews}">
      ${util.formatNumber(post.pageviews)} views
    </span>`;
}

function renderPosts(items, container) {
  util.sortPosts(items);

  // Group posts by the date they were submitted.
  items = groupBySubmittedDate(items);
  const template = (items) => html`
    ${renderPaginationLinks()}
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
                </div>
                <div class="post_meta center layout overflow">
                  <span class="post_child post_domain clickable""
                        onclick="filterBy('domain', '${post.domain}')">
                    <img src="${iconSrc(post.domain)}" class="source_icon">${post.domain}
                  </span>
                  ${renderAnalyticsData(post)}
                  <span class="post_child post_author clickable"
                        onclick="filterBy('author', '${post.author}')">${by}</span>
                </div>
              </div>
              <div class="post_buttons layout">
                <a href="" class="post_button remove_button" onclick="return handleDelete(this, '${date}', '${post.url}')"
                   title="Remove this post"></a>
                <a href="" class="post_button share_button" onclick="return sharePost(this, '${post.url}', '${post.title}')" title="Share this post"></a>
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
    ${renderPaginationLinks()}
  `;

  render(template(items), container);
}

export {renderPosts, container};
