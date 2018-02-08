import fs from 'fs';
import TwitterAPI from 'twitter';

const TWITTER_CREDENTIALS = JSON.parse(fs.readFileSync('./twitter_credentials.json'));

export default class Twitter {
  constructor() {
    this.client = new TwitterAPI(TWITTER_CREDENTIALS);
  }
  async getTweets(screenName = 'ChromiumDev') {
    try {
      return this.client.get('statuses/user_timeline', {
        screen_name: screenName,
        count: 200
      });
    } catch (err) {
      throw err;
    }
  }
}
