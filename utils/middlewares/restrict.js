const express = require("express");
const session = require("express-session");
const path = require("path");
const connect = require("../database.js");
const CharError = require("../charError.js");

// Middleware to make sure user is logged in
var restrict = function(req, res, next){
	if (req.user) {
		next();
	} else {
		let err = new CharError("Missing Auth Token", "Auth Token must be provided");
		err.status = 403;
		next(err);
	}
};

// Restrict route to administrators only
restrict.toAdministrator = function(req, res, next){
	if(req.user.role == "administrator"){
		next();
	}else{
		let err = new CharError("Forbidden", "User not allowed this resource");
		err.status = 403;
		next(err);
	}
};

// Restrict route to administrators and editors only
restrict.toEditor = function(req, res, next){
	if(req.user.role == "administrator" || req.user.role == "editor"){
		next();
	}else{
		let err = new CharError("Forbidden", "User not allowed this resource");
		err.status = 403;
		next(err);
	}
};

// Restrict route to administrators, editors and authors only
restrict.toAuthor = function(req, res, next){
	if(req.user.role == "administrator" || req.user.role == "editor" || req.user.role == "author"){
		next();
	}else{
		let err = new CharError("Forbidden", "User not allowed this resource");
		err.status = 403;
		next(err);
	}
};


module.exports = restrict;