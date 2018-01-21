## Development

Setup it up:

```
yarn
```

Create a `serviceAccountKey.json` file in the root folder and add your service
account credentials from the Google Developer Console.

Build it:

```
yarn build
```

Serve it:

```
yarn start
```

Navigate to http://localhost:8080/. The page will update in realtime as people
add posts.

## Deploy

To deploy:

```
yarn deploy
```

## Extension

Install the extension directory as an unpacked extension. The first time you
post an URL, an OAuth popup will open asking you to login. This is so we know
who added the post.
