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

let CACHE = new Map();

const CHANNEL_ID = 'UCnUYZLuoy1rq1aVMwx4aTzw';
const API_KEY = 'AIzaSyCxKfeIYSP1Z8zCMd2bgpvndqmfWvcxe5M';

class YoutubeAnalytics {
  static get MAX_RESULTS_PER_PAGE() {
    return 50; // 50 is limit by API.
  }

  constructor(authClient) {
    this.api = google.youtube({
      version: 'v3',
      auth: authClient,
    });
    this.channelId = null;
  }

  /**
   * Creates a new map with titles mapped to results.
   * @param {!Map} videos
   */
  static toTitleMap(videos) {
    const titleMap = new Map();
    for (const [videoId, video] of videos) {
      titleMap.set(video.snippet.title, video);
    }
    return titleMap;
  }

  async getUploadsPlaylistId(forUsername = 'ChromeDevelopers') {
    const response = await this.api.channels.list({
      part: 'contentDetails',
      forUsername,
    });

    const channels = response.data.items;
    this.channelId = channels[0].id;
    this.uploadsPlaylistId = channels[0].contentDetails.relatedPlaylists.uploads;

    return this.uploadsPlaylistId;
  }

  /**
   * Gets all items from a playlist. If playlist spans across multiple pages,
   * makes additional requests until there are no more pages to fetch.
   * @param {string} playlistId Playlist id.
   */
  async getAllPlaylistItemsFor(playlistId) {
    const videoIds = [];
    let pageToken = null;

    const getPlaylistItems = function(playlistId, pageToken) {
      return this.api.playlistItems.list({
        part: 'contentDetails',
        playlistId,
        maxResults: YoutubeAnalytics.MAX_RESULTS_PER_PAGE,
        type: 'video',
        pageToken,
      });
    }.bind(this);

    do {
      const resp = await getPlaylistItems(playlistId, pageToken);
      videoIds.push(...resp.data.items.map(item => item.contentDetails.videoId));
      pageToken = resp.data.nextPageToken;
    } while (pageToken);

    return videoIds;
  }

  /**
   * Fetches statistics for each video.
   * @param {!Array<string>} videoIds Array of Youtube video ids.
   * @return {!Map}
   */
  async getVideos(videoIds) {
    const items = new Map();
    let start = 0;
    let last = YoutubeAnalytics.MAX_RESULTS_PER_PAGE;

    // Page through videos b/c id param can only take max 50 videos ids.
    do {
      const resp = await this.api.videos.list({
        part: 'snippet,statistics',
        id: videoIds.slice(start, last).join(','),
      })

      resp.data.items.map(item => {
        item.statistics.viewCount = parseInt(item.statistics.viewCount);
        items.set(item.id, item);
      });

      start = last;
      last = start + YoutubeAnalytics.MAX_RESULTS_PER_PAGE;

    } while (items.size < videoIds.length);

    return items;
  }
}

/**
 * @param {boolean=} clearCache Whether to clear the cache. True by default.
 * @return {Promise<!Map>}
 */
async function updateAnalyticsData(clearCache = false) {
  if (CACHE.size && !clearCache) {
    return CACHE;
  }

  console.info('Updating YouTube analytics data...');
  const tic = Date.now();

  const youtube = new YoutubeAnalytics(API_KEY);
  const uploadsPlaylistId = await youtube.getUploadsPlaylistId('ChromeDevelopers');
  const videoIds = await youtube.getAllPlaylistItemsFor(uploadsPlaylistId);
  const videos = await youtube.getVideos(videoIds);

  console.info(`YouTube analytics update took ${(Date.now() - tic)/1000}s`);

  if (videoIds.length != videos.size) {
    console.warn("Videos list doesn't match number of items found in uploads playlist.");
  }

  CACHE = videos;

  return videos;
}

export {YoutubeAnalytics, updateAnalyticsData};

// (async() => {

// const videos = await updateAnalyticsData();

// Sort by pageviews.
// videos = new Map([...videos.entries()]
//     .sort((a, b) => b[1].statistics.viewCount - a[1].statistics.viewCount));

// let i = 1;
// for (const [videoId, video] of videos) {
//   console.log(`${i++}. ${video.snippet.title} ${util.formatNumber(video.statistics.viewCount)}`);
//   //video.snippet.description, video.snippet.publishedAt
//   //`https://youtube.com/watch?v=${video.id}`
// }

// })();
