import fs from 'fs';
import TwitterAPI from 'twitter';

const TWITTER_CREDENTIALS = JSON.parse(fs.readFileSync('./twitter_credentials.json'));

const CACHE = new Map();

export default class Twitter {
  constructor(screenName = null) {
    this.client = new TwitterAPI(TWITTER_CREDENTIALS);
    this.screenName = screenName;
  }

  async updateTweets(screenName = this.screenName) {
    console.info('Updating Tweets...');
    const tic = Date.now();

    let tweets = [];

    try {
      const resp = await this.client.get('statuses/user_timeline', {
        screen_name: screenName,
        count: 200
      });

      tweets = resp
          .filter(tweet => !tweet.in_reply_to_user_id)
          .map(tweet => ({
            title: tweet.text,
            url: `https://twitter.com/${screenName}/status/${tweet.id_str}`,
            submitted:  (new Date(tweet.created_at)).toJSON(),
            submitter: {
              name: 'Twitter bot',
              email: '',
              picture: 'img/twitter_icon.png',
              bot: true,
              // picture: tweet.user.profile_image_url_https || 'img/twitter_icon.png',
            },
            author: screenName
            // rss: true,
          }));
    } catch (err) {
      console.error(`Unknown user: ${screenName}`);
      console.error(err);
      return [];
    }

    // TODO: don't grow cache for every user.
    CACHE.set(screenName, tweets);

    console.info(`Tweets from ${screenName} update took ${(Date.now() - tic)/1000}s`);

    return tweets;
  }

  async getTweets(screenName = this.screenName) {
    if (CACHE.has(screenName)) {
      return CACHE.get(screenName);
    }
    return this.updateTweets(screenName);
  }
}
