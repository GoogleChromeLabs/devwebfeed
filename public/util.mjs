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

/**
 * Flattens an array.
 * @param {!Array<string|!Array<string>>} arr
 * @return {!Array<string>}
 */
function flatten(arr) {
  return arr.reduce((acc, val) => acc.concat(val), []);
}

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
}

/**
 * Prettifies numbers.
 * @param {number} num
 */
function formatNumber(num) {
  return num >= 1e6 ? `${(num / 1e6).toFixed(2)}M` :
         num >= 1000 ? `${(num / 1000).toFixed(2)}k` : num;
}

function sortPostsByDate(items) {
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

/**
 * Unique items based on url property.
 * @param {!Array} items
 * @param {string} propName Property name to filter on.
 * @return {!Array} unique array of items
 */
function uniqueByProperty(items, propName) {
  const posts = Array.from(items.reduce((map, item) => {
    return map.set(item[propName], item);
  }, new Map()).values());
  return posts;
}

function uniquePosts(items) {
  items = uniqueByProperty(items, 'url');
  return uniqueByProperty(items, 'title');
}

function formatDate(dateStr, monthFormat = 'short') {
  try {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat(
        'en-US', {year: 'numeric', month: monthFormat, day: 'numeric'}).format(date);
  } catch (err) {
    console.error(dateStr, err);
  }
}

export const currentYear = String((new Date()).getFullYear());

export {sortPostsByDate, flatten, debounce, uniquePosts, formatNumber, formatDate};
