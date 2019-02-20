const moment = require("moment");
const nanoid = require("nanoid");
const path = require("path");

const limits = {
	// Change to some integer value to limit file size
	fileSize: 1000000,
	acceptedMIME: [
		"audio/ogg",
		"image/jpeg"
	]
};

const utils = {
	processFileMetadata: function(file, req){
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
	},

	setFileEntryMetadata: function(entry, file, req){
		// Model will save a reference to the uploaded file
		// The client will be responsible for uploading the file
		// so that the link saved in the model will work
		entry.uid = file.data.uid;
		entry.permalink = file.data.file_permalink;
		// File link will be write once only
		entry.upload_link = `${req.protocol}://${req.get("host")}/api/upload/${file.data.uid}`;
		entry.upload_expire = file.data.uploadExpire;
		return Promise.resolve(file);
	}
};

module.exports = utils;