const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const path = require("path");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`Server DB: '${e.message}';`);
    process.exit(1);
  }
};

initializeDBAndServer();

app.post("/users/", async (request, response) => {
  const { username, name, password, gender, location } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const checkUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(checkUserQuery);
  if (dbUser === undefined) {
    const createUserQuery = `
        INSERT INTO user (username, name, password, gender, location)
        VALUES (
          '${username}', 
          '${name}',
          '${hashedPassword}', 
          '${gender}',
          '${location}'
        );`;
    const dbUserResponse = await db.run(createUserQuery);
    const userId = dbUserResponse.lastID;
    response.send(`Created User With userId: '${userId}';`);
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUserGot = await db.get(selectUserQuery);
  if (dbUserGot === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      dbUserGot.password
    );
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = await jwt.sign(payload, "ashrith");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticationToken = async (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "ashrith", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.get("/states/", authenticationToken, async (request, response) => {
  const getStateQuery = `
    SELECT state_id as stateId, state_name as stateName, population
    FROM state;`;
  const stateResponse = await db.all(getStateQuery);
  response.send(stateResponse);
});

app.get("/states/:stateId/", authenticationToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `
    SELECT state_id as stateId, state_name as stateName,
    population FROM state WHERE state_id = ${stateId};`;
  const dbState = await db.get(getStateQuery);
  response.send(dbState);
});

app.post("/districts/", authenticationToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const postDistrictQuery = `
    INSERT INTO district (district_name, state_id, cases, cured, active, deaths)
    VALUES (
        '${districtName}',
        ${stateId},
        '${cases}',
        '${cured}',
        '${active}',
        '${deaths}');`;
  const newDistrict = await db.run(postDistrictQuery);
  const districtId = newDistrict.lastID;
  response.send("District Successfully Added");
});

app.get(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `SELECT district_id as districtId, district_name as districtName,
    state_id as stateId, cases, cured, active, deaths FROM district
    WHERE district_id = ${districtId};`;
    const dbDistrict = await db.get(getDistrictQuery);
    response.send(dbDistrict);
  }
);

app.delete(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `DELETE FROM district
    WHERE district_id = ${districtId};`;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

app.put(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const { districtId } = request.params;
    const updateDistrictQuery = `UPDATE district SET
    district_name = '${districtName}',
    state_id = ${stateId},
    cases = '${cases}',
    cured = '${cured}',
    active = '${active}',
    deaths = '${deaths}'
    WHERE district_id = ${districtId};`;
    await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

app.get(
  "/states/:stateId/stats/",
  authenticationToken,
  async (request, response) => {
    const { stateId } = request.params;
    const statsQuery = `SELECT 
    sum(cases),
    sum(cured),
    sum(active),
    sum(deaths)
    FROM district
    WHERE state_id = ${stateId};`;
    const stats = await db.get(statsQuery);
    console.log(stats);

    response.send({
      totalCases: stats["sum(cases)"],
      totalCured: stats["sum(cured)"],
      totalActive: stats["sum(active)"],
      totalDeaths: stats["sum(deaths)"],
    });
  }
);

module.exports = app;
