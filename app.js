const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const databasePath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    app.listen(3002, () =>
      console.log("Server Running at http://localhost:3002/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const authenticateToken = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  const authHeader = request.headers["authorization"];
  let jwtToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        request.tweetId = tweetId;
        request.tweet = tweet;
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, gender, name } = request.body;
  const getUsersQuery = `select * from user;`;
  const usersList = await db.all(getUsersQuery);
  const userExists = usersList.filter((user) => user.username === username);
  if (userExists.length !== 0) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const addUserQuery = `insert into user(name,username,password,gender) values('${name}','${username}','${hashedPassword}','${gender}')`;
      await db.run(addUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUsersQuery = `select * from user where username='${username}';`;
  const user = await db.get(getUsersQuery);
  if (user === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, user.password);
    if (!isPasswordMatched) {
      response.status(400);
      response.send("Invalid password");
    } else {
      const jwtToken = jwt.sign(user, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    }
  }
});

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name);
  const getTweetsFeedQuery = `
    SELECT
        username,tweet,date_time AS dateTime
    FROM
        follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id INNER JOIN user ON user.user_id=follower.following_user_id
    WHERE
        follower.follower_user_id = ${user_id}
    ORDER BY
        date_time DESC
    LIMIT 4;`;
  const tweetFeedArray = await db.all(getTweetsFeedQuery);
  response.send(tweetFeedArray);
});

app.get("/user/following", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name);
  const userFollowsQuery = `
    SELECT
        name
    FROM
        user INNER JOIN follower ON user.user_id = follower.following_user_id
    WHERE
        follower.follower_user_id = ${user_id};`;
  const userFollowersArray = await db.all(userFollowersQuery);
  response.send(userFollowersArray);
});

app.get("/user/followers", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name);
  const userFollowsQuery = `
    SELECT
        name
    FROM
        user INNER JOIN follower ON user.user_id = follower.follower_user_id
    WHERE
        follower.following_user_id = ${user_id};`;
  const userFollowersArray = await db.all(userFollowersQuery);
  response.send(userFollowersArray);
});

// Get Tweet API-6
app.get("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const tweetsQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId};`;
  const tweetsResult = await db.get(tweetsQuery);
  const userFollowersQuery = `
    SELECT *
        FROM follower INNER JOIN user ON user.user_id = follower.following_user_id
    WHERE 
        follower.follower_user_id=${user_id};`;
  const userFollowers = await db.all(userFollowersQuery);
  if (
    userFollowers.some(
      (item) => item.following_user_id === tweetsResult.user_id
    )
  ) {
    const getTweetDetailsQuery = `
    SELECT
        tweet,COUNT (DISTINCT (like.like_id)) AS likes,COUNT (DISTINCT (reply.reply_id)) AS replies,tweet.date_time AS dateTime
    FROM
        tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply ON reply.tweet_id =tweet.tweet_id
    WHERE
        tweet.tweet_id = ${tweetId} AND tweet.user_id=${userFollowers[0].user_id};`;
    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

// Get Tweet Liked Users API-7
app.get(
  "/tweets/:tweetId/likes",
  authenticateToken,
  async (request, response) => {
    const { tweetId, payload } = request;
    const { user_id, name, username, gender } = payload;
    const getLikedUsersQuery = `
        SELECT
            *
        FROM
            follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN like ON like.tweet_id=tweet.tweet_id
        INNER JOIN user ON user.user_id = like.user_id
        WHERE
            tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};`;

    const likedUsers = await db.all(getLikedUsersQuery);

    if (likedUsers.length !== 0) {
      let likes = [];
      const getNamesArray = (likedUsers) => {
        for (let item of likedUsers) {
          likes.push(item.username);
        }
      };
      getNamesArray(likedUsers);
      response.send({ likes });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get(
  "/tweets/:tweetId/replies",
  authenticateToken,
  async (request, response) => {
    const { tweetId, payload } = request;
    const { user_id, name, username, gender } = payload;
    const getRepliedUsersQuery = `
    SELECT *
    FROM
        follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN reply ON reply.tweet_id=tweet.tweet_id
        INNER JOIN User ON user.user_id = reply.user_id
    WHERE
        tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};`;
    const repliedUsers = await db.all(getRepliedUsersQuery);
    console.log(repliedUsers);
    if (repliedUsers.length !== 0) {
      let replies = [];
      const getNamesArray = (repliedUsers) => {
        for (let item of repliedUsers) {
          let object = {
            name: item.name,
            reply: item.reply,
          };
          replies.push(object);
        }
      };
      getNamesArray(repliedUsers);
      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get("/user/tweets", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name, user_id);
  const getTweetsDetailsQuery = `
    SELECT
        tweet.tweet AS tweet,
        COUNT (DISTINCT (like.like_id)) AS likes,
        COUNT (DISTINCT (reply.reply_id)) AS replies,
        tweet.date_time AS dateTime
    FROM
        user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id
        INNER JOIN reply on reply.tweet_id=tweet.tweet_id
    WHERE
        user.user_id = ${user_id}
    GROUP BY
        tweet.tweet_id;`;
  const tweetsDetails = await db.all(getTweetsDetailsQuery);
  response.send(tweetsDetails);
});

app.post("/user/tweets", authenticateToken, async (request, response) => {
  const { tweet } = request;
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name, tweetId);
  const postTweetQuery = `
INSERT INTO
tweet (tweet, user_id)
 VALUES ('${tweet}',${user_id}
);`;
  await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

// Delete Tweet API-11
app.delete("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const selectUserQuery = `SELECT * FROM tweet WHERE tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId};`;
  const tweetUser = await db.all(selectUserQuery);
  if (tweetUser.length !== 0) {
    const deleteTweetQuery = `
        DELETE 
        FROM tweet
        WHERE
            tweet.user_id =${user_id} AND tweet.tweet_id =${tweetId};`;
    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
