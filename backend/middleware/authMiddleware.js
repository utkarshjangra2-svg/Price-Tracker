import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ msg: "Not authorized", code: "NO_TOKEN" });
    }

    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    } catch (jwtError) {
      if (jwtError.name === "TokenExpiredError") {
        return res.status(401).json({ msg: "Session expired, please sign in again.", code: "TOKEN_EXPIRED" });
      }
      return res.status(401).json({ msg: "Invalid token, please sign in again.", code: "INVALID_TOKEN" });
    }

    const user = await User.findById(decoded.id).select("_id name email zomato");

    if (!user) {
      return res.status(401).json({ msg: "User not found", code: "USER_NOT_FOUND" });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ msg: "Authentication error, please sign in again.", code: "AUTH_ERROR" });
  }
};
