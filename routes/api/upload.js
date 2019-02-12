// Main entry point for API uploading routes
require("dotenv").config();
const fs = require("fs");
const Promise = require("bluebird");
const path = require("path");
const _ = require("lodash");
const moment = require("moment");
const nanoid = require("nanoid");
const ActiveRecord = require("active-record");
const bodyParser = require("body-parser");

const express = require("express");
const router = express.Router();

const CharError = require("../../utils/charError.js");
const restrict = require("../../utils/middlewares/restrict.js");

// Configurations (hardcoded for now, should remove in the future)
const limits = {
	// Change to some integer value to limit file size
	fileSize: 1000000,
	acceptedMIME: [
		"audio/ogg",
		"image/jpeg"
	]
};

const Files = new ActiveRecord({
	tableSlug: "files_upload"
});

router.get("/", restrict.toAuthor, function(req, res, next) {
	res.json({
		message: "Upload endpoint"
	});
});

router.post("/", restrict.toAuthor, function(req, res, next){
	if(Array.isArray(req.body)){
		const fileCollection = new Files.Collection(Files.Model, ...req.body);
		const promises = [];
		let err;
		_.each(fileCollection, (file) => {
			if(!_.includes(limits.acceptedMIME, file.data["content-type"])){
				err = new CharError("Invalid MIME type", `File type "${file.data["content-type"]}" is not supported`, 415);
				return false;
			}else{
				processFileMetadata(file);
			}
		});
		if(err){
			return next(err);
		}else{
			fileCollection.saveAll().then(() => {
				const reply = fileCollection.map((file) => {
					return {
						location: `${req.protocol}://${req.get("host")}/api/upload/${file.data.uploadLocation}`,
						uploadExpire: file.data.uploadExpire
					};
				});
				res.json(reply);
			});
		}
	}else{
		const file = new Files.Model(req.body);

		if(!_.includes(limits.acceptedMIME, file.data["content-type"])){
			return next(new CharError("Invalid MIME type", `File type "${file.data["content-type"]}" is not supported`, 415));
		}else{
			processFileMetadata(file);
			file.save().then(() => {
				res.json({
					location: `${req.protocol}://${req.get("host")}/api/upload/${file.data.uid}`,
					uploadExpire: file.data.uploadExpire,
				});
			});
		}
	}

	function processFileMetadata(file){
		file.data.created_at = moment().format();
		file.data.modified_at = moment().format();
		file.data.file_owner = req.user.username;
		file.data.uploadExpire = moment().add(1, "hours").format();
		file.data.uid = nanoid(20);
		const fileExt = path.extname(file.data.file_name) || "";
		file.data.file_permalink = `${req.protocol}://${req.get("host")}/uploads/${file.data.uid}${fileExt}`;
		file.data.saved_path = null;
		if(!file.data.file_size){
			file.data.file_size = limits.fileSize;
		}
	}
});

router.post("/:location", restrict.toAuthor, bodyParser.raw({
	limit: limits.fileSize,
	type: limits.acceptedMIME
}), function(req, res, next){
	if(!_.includes(limits.acceptedMIME, req.headers["content-type"])){
		return next(new CharError("Invalid MIME type", `File type "${req.headers["content-type"]}" is not supported`, 415));
	}

	Files.findBy({uid: req.params.location}).then((file) => {
		if(file.data === null){
			next(new CharError("Invalid upload URL", "Upload URL is invalid", 400));
		}else if(file.data["content-type"] !== req.headers["content-type"]){
			next(new CharError("MIME Type Mismatch", `File type "${req.headers["content-type"]}" does not match metadata entry`, 400));
		}else if(moment(file.data.uploadExpire).isBefore(moment())){
			file.destroy();
			next(new CharError("Upload Link Expired", "This upload link has expired", 400));
		}else if(file.data.saved_path !== null){
			// File already exist
			next(new CharError("Invalid upload URL", "Upload URL is invalid", 400));
		}else{
			// Get file extension
			const fileExt = path.extname(file.data.file_name) || "";
			const savedName = `${file.data.uid}${fileExt}`;
			delete file.data.uploadExpire;
			delete file.data.uploadLocation;
			file.data.file_size = req.body.length;
			file.data.modified_at = moment().format();
			file.data.saved_path = path.join("./uploads/", savedName);
			file.data.file_permalink = `${req.protocol}://${req.get("host")}/uploads/${savedName}`;

			// Save uploaded file
			fs.writeFile(file.data.saved_path, req.body, (err) => {
				if(err) return next(err);

				// Save database entry of file
				file.save().then(() => {
					res.json({
						resource_path: file.data.file_permalink
					});
				}).catch((err) => {
					next(err);
				});
			});
		}
	}).catch((err) => {
		next(err);
	});
});

module.exports = router;