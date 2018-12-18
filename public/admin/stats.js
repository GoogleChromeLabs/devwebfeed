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

import * as admin from './admin.js';
import * as util from '../../util.mjs';
import {html, render} from '../../lit-html/lit-html.js';
import {repeat} from '../../lit-html/directives/repeat.js';

let _posts = [];
let filteredPosts = [];
let _filteringBy = null;
const ORDER = {desc: 0, asc: 1};
let _sortingBy = ORDER.desc;

const container = document.querySelector('#container');
const views = document.querySelector('#views');

function sortByPageviews() {
  const posts = filteredPosts.length ? filteredPosts : _posts;
  let sortedPosts = posts.sort((a, b) => b.pageviews - a.pageviews);
  if (_sortingBy === ORDER.asc) {
    sortedPosts = sortedPosts.reverse();
    _sortingBy = ORDER.desc;
  } else {
    _sortingBy = ORDER.asc;
  }
  renderTable(sortedPosts, container);
  views.textContent = `${views.textContent} ${_sortingBy === ORDER.asc ? '↓' : '↑'}`;
}

function sortByDate() {
  let sortedPosts = filteredPosts.length ? filteredPosts : _posts;
  util.sortPostsByDate(sortedPosts);
  if (!_sortingBy || _sortingBy === ORDER.desc) {
    sortedPosts = sortedPosts.reverse();
    _sortingBy = ORDER.asc;
  } else {
    _sortingBy = ORDER.desc;
  }
  renderTable(sortedPosts, container);
}

function filterBy(key, needle = null) {
  const filteringParams = ['domain', 'author'];

  if (key && !filteringParams.includes(key)) {
    return;
  }

  const currentURL = new URL(location.href);
  const params = currentURL.searchParams;
  const filterEl = document.querySelector('#filtering');
  const needleEl = filterEl.querySelector('.filtering-needle');

  filterEl.hidden = false;

  // Clear all previous filters.
  for (const key of params.keys()) {
    if (filteringParams.includes(key)) {
      params.delete(key);
    }
  }

  filteredPosts = _posts;

  // TODO: support filtering on more than one thing.
  if (needle === _filteringBy) {
    params.delete(key);
    _filteringBy = null;
  } else {
    filteredPosts = filteredPosts.filter(post => post[key] && post[key].match(needle));
    params.set(key, needle);
    needleEl.textContent = needle;
    _filteringBy = needle;
  }

  setTimeout(() => filterEl.classList.toggle('on', _filteringBy !== null), 0);

  window.history.pushState(null, '', currentURL.href);
  renderTable(filteredPosts, container);
}

function clearFilters() {
  _filteringBy = null
  filterBy(null, null);
  return false;
}

function renderAnalyticsData(post) {
  if (!post.pageviews) {
    return '';
  }

  return html`
    <span title="${post.pageviews} Google Analytics page views">
      ${util.formatNumber(post.pageviews)}
    </span>`;
}

export function renderTable(posts) {
  const postsTemplate = html`
    ${repeat(posts, (item) => item.url, (item, i) => {
      const author = item.author ? item.author.trim() : ' ';
      const url = new URL(item.url);
      return html`
        <tr>
          <td><div class="oveflow" style="width:15px;">${i + 1}.</span></td>
          <td>
            <a href="${item.url}" target="_blank" class="post_url overflow">${item.title || item.domain + url.pathname}</a>
          </td>
          <td onclick="filterBy('domain', '${item.domain}')">
            <div class="post_domain clickable overflow">${item.domain}</div>
          </td>
          <td>${renderAnalyticsData(item)}</td>
          <td class="clickable" onclick="filterBy('author', '${author}')">
            <div class="overflow post_author">${author}</div>
          </td>
          <td><div class="overflow">${item.submitted.split('T')[0]}</div></td>
        </tr>`;
    })}
  `;

  render(postsTemplate, container);

  const totalViews = posts.reduce((accum, post) => accum += post.pageviews || 0, 0);
  views.textContent = `Views ${util.formatNumber(totalViews)}`;
}

export async function getYearlyPosts() {
  let params = new URL(location.href).searchParams;
  const year = params.get('year') || util.currentYear;

  const uid = await admin.initAuth(); // Check user's auth state.

  const yearsData = [
    admin.getPosts(year, uid),
    // admin.getPosts(year - 1, uid),
    // admin.getPosts(year - 2, uid),
  ];

  _posts = await Promise.all(yearsData).then(results => {
    const posts = util.flatten(results).filter(post => post.pageviews);
    util.sortPostsByDate(posts);
    return posts;
  });

  return _posts;
}

export async function list() {
  renderTable(await getYearlyPosts());

  // Filter list after data has been set.
  const params = new URL(location.href).searchParams; // get params again since they may have changed since auth.
  for (const key of params.keys()) {
    filterBy(key, params.get(key));
  }
}

window.filterBy = filterBy;
window.clearFilters = clearFilters;
window.sortByPageviews = sortByPageviews;
window.sortByDate = sortByDate;
