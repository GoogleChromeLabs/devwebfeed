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

function debounce(func, wait, immediate) {
	let timeout;
	return function() {
    const context = this;
    const args = arguments;
		const later = () => {
			timeout = null;
			if (!immediate) {
        func.apply(context, args);
      }
		};
		const callNow = immediate && !timeout;
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
		if (callNow) {
      func.apply(context, args);
    }
	};
};

// const debounceRenderPosts = debounce((posts, container) => {
//   console.log('here');
//   renderPosts(posts, container);
// }, 250);

function sortPosts(items) {
  items.sort((a, b) => {
    a = String(a.submitted);
    b = String(b.submitted);
    if (a < b) {
      return -1;
    }
    if (a > b) {
      return 1;
    }
    return 0;
  }).reverse();
}

function uniqueItemsByUrl(items) {
  // Return unique items based on url property.
  const posts = Array.from(items.reduce((map, item) => {
    return map.set(item.url, item);
  }, new Map()).values());
  return posts;
}

export const currentYear = String((new Date()).getFullYear());

export {sortPosts, debounce, uniqueItemsByUrl};
