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

import fs from 'fs';
import url from 'url';
const URL = url.URL;
import GoogleAPIs from 'googleapis';
const google = GoogleAPIs.google;
// import * as util from './public/util.mjs';
// import GoogleAuth from 'google-auth-library';

let CACHE = new Map();

const START_DATE = '2011-01-01'; // Beginning date to fetch all analytics data for.
const MIN_PAGEVIEWS = 20;

const VIEW_IDS = {
  robdodson: {
    viewId: '57149356',
    pathRegexs: ['^/'],
    notPathRegexs: ['^/tag/', '^/blog/categories/', '^/author/rob/', '^/blog/page/', '^/page/'],
  },
  ericbidelman: {
    viewId: '48771992',
    pathRegexs: ['^/post/'],
    removeFromTitles: ' - Eric Bidelman',
  },
  mathias: {
    viewId: '15820579',
    pathRegexs: ['^/notes/', '^/demo/'],
  },
  // webfu: {viewId: '88450368'},
};

// const creds = JSON.parse(fs.readFileSync('./google_oauth_credentials.json'));
// const API_KEY = 'AIzaSyCzhvPbNswHA1TXcqtSF0aiVj7O3oi9BfM';
// const app = await google.auth.getApplicationDefault();

class Analytics {
  static get SCOPES() {
    return ['https://www.googleapis.com/auth/analytics.readonly'];
  }

  constructor(authClient) {
    this.api = google.analyticsreporting({
      version: 'v4',
      auth: authClient, // API_KEY,
    });
  }

  /**
   * Creates a new map with titles mapped to results.
   * @param {!Map} map
   */
  static toTitleMap(map) {
    const titleMap = new Map();
    for (const [path, result] of map) {
      titleMap.set(result.title, result);
    }
    return titleMap;
  }

  /**
   * Fetch results from the Reporting API.
   * @param {!Object=} query
   * @return {!{report: !Object, headers: !Array<{type: string, name: string}>}}
   */
  async query({viewId, startDate = '30daysAgo', endDate = 'yesterday',
               pathRegexs = ['/'], notPathRegexs = []} = {}) {
    const query = {
      viewId,
      dateRanges: [{startDate, endDate}],
      metrics: [{expression: 'ga:pageviews'}, {expression: 'ga:users'}],
      metricFilterClauses: [{
        filters: [{
          metricName: 'ga:pageviews',
          operator: 'GREATER_THAN',
          comparisonValue: String(MIN_PAGEVIEWS),
        }]
      }],
      dimensions: [{name: 'ga:pageTitle'}, {name: 'ga:pagePath'}],
      orderBys: [{fieldName: 'ga:pageviews', sortOrder: 'DESCENDING'}],
      dimensionFilterClauses: [{
        // Include only some paths.
        operator: 'OR',
        filters: [
          ...pathRegexs.map(regex => {
            return {
              dimensionName: 'ga:pagePath',
              operator: 'REGEXP',
              expressions: regex,
            };
          })
        ],
      }, {
        // Filter out certain paths.
        operator: 'AND',
        filters: [
          ...notPathRegexs.map(regex => {
            return {
              dimensionName: 'ga:pagePath',
              not: true,
              operator: 'REGEXP',
              expressions: [regex],
            };
          })
        ],
      }],
    };

    const resp = await this.api.reports.batchGet({
      resource: {reportRequests: [query]}
    });

    const report = resp.data.reports[0];
    const headers = report.columnHeader.metricHeader.metricHeaderEntries;
    const urlMap = new Map();

    if (!report.data.rowCount) {
      return {results: urlMap, headers, startDate, endDate, rowCount: 0};
    }

    report.data.rows.forEach((row, i) => {
      row.metrics.forEach((metric, j) => {
        const [title, path] = row.dimensions;
        const [pageviews, users] = metric.values.map(val => parseInt(val));

        // If a URL has already been seen, add to its pageviews. Ignore query params.
        const pathWithoutParams = new URL(path, 'http://dummydomain.com').pathname;
        const item = urlMap.get(pathWithoutParams);
        if (item) {
          item.pageviews += pageviews;
          item.users += users;
        } else {
          urlMap.set(pathWithoutParams, {title, path: pathWithoutParams, pageviews, users});
        }
      });
    });

    return {
      results: urlMap,
      headers,
      startDate,
      endDate,
      rowCount: report.data.rowCount
    };
  }
}

let authClient = google.auth.fromJSON(JSON.parse(
    fs.readFileSync('./analyticsServiceAccountKey.json')));
// authClient.scopes = Analytics.SCOPES;
if (authClient.createScopedRequired && authClient.createScopedRequired()) {
  authClient = authClient.createScoped(Analytics.SCOPES);
}

/**
 * @param {boolean=} clearCache Whether to clear the cache. True by default.
 * @return {Promise<!Map>}
 */
async function updateAnalyticsData(clearCache = false) {
  if (CACHE.size && !clearCache) {
    return CACHE;
  }

  console.info('Updating Analytics data...');
  const tic = Date.now();

  await authClient.authorize();

  const ga = new Analytics(authClient);

  const merged = new Map();

  for (const [user, config] of Object.entries(VIEW_IDS)) {
    const result = await ga.query({
      viewId: config.viewId,
      startDate: START_DATE,
      endDate: (new Date()).toJSON().split('T')[0],
      pathRegexs: config.pathRegexs,
      notPathRegexs: config.notPathRegexs,
    });
    result.results.forEach(item => {
      if ('removeFromTitles' in config) {
        item.title = item.title.replace(config.removeFromTitles, '');
      }
      merged.set(item.path, item);
    });
  }

  // Sort by pageviews.
  const results = new Map([...merged.entries()]
      .sort((a, b) => b[1].pageviews - a[1].pageviews));

  CACHE = results;

  console.info(`Analytics update took ${(Date.now() - tic)/1000}s`);

  return results;
}

export {Analytics, updateAnalyticsData};

// (async() => {

// // const oauth2Client = new google.auth.OAuth2();//creds.client_id, creds.client_secret, '');
// // oauth2Client.setCredentials(creds);
// // oauth2Client.apiKey = API_KEY;
// // google.options({auth: oauth2Client});

// // const creds = await GoogleAuth.auth.getCredentials();
// const allResults = await updateAnalyticsData();
// let i = 1;
// for (const [path, result] of allResults) {
//   const {title, path, pageviews, users} = result;
//   console.log(`${i++}. ${path} ${util.formatNumber(pageviews)} views, ${util.formatNumber(users)} users`);
// }

// })();
