require("dotenv").config();
const _ = require("lodash");
const express = require("express");
const DynamicRecord = require("dynamic-record");

const router = express.Router();
const auth = require("../../utils/auth.js");
const CharError = require("../../utils/charError.js");
const Users = new DynamicRecord({
	tableSlug: "_users_auth"
});

// Only allow signups if app setting allows it
router.use(function(req, res, next){
	if(process.env.ALLOW_SIGNUP === "true"){
		next();
	}else{
		next(new CharError("Not Found", "Cannot find resource", 404));
	}
});

router.post("/", function(req, res, next){
	auth.signup(req.body.username, req.body.password, "unverified").then((result) => {
		res.json({
			"message": `User ${result} created`
		});
	}).catch((err) => {
		if(err.name == "MongoError" && err.code == 11000){
			// Duplicate username
			next(new CharError("Username not available", `Username "${req.body.username}" is already registered`));
		}else{
			next(new CharError());
		}
	});
});

module.exports = router;