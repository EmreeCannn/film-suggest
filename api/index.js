import app from "../src/index.js";
import serverless from "serverless-http";

export const config = {
  runtime: "nodejs18.x"
};

export default serverless(app);
