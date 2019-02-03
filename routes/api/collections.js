require("dotenv").config();
const _ = require("lodash");
const express = require("express");
const moment = require("moment");
const jwt = require("jsonwebtoken");
const router = express.Router();
const Promise = require("bluebird");
const ActiveRecord = require("active-record");

Promise.promisifyAll(jwt);
const restrict = require("../../utils/middlewares/restrict.js");
const CharError = require("../../utils/charError.js");

const secret = process.env.JWT_SECRET;

// Route: {root}/api/collections/...

// GET routes
// GET collection with slug
router.get("/:collectionSlug", function(req, res){
	const Collection = new ActiveRecord({
		tableSlug: req.params.collectionSlug
	});
	Collection.all().then((collection) => {
		res.json(collection.data);
	});
});

// GET specific model from a collection
router.get("/:collectionSlug/:modelID", function(req, res){
	const Collection = new ActiveRecord({
		tableSlug: req.params.collectionSlug
	});
	Collection.findBy({"_uid": parseInt(req.params.modelID)}).then((collection) => {
		res.json(collection.data);
	});
});


// POST routes
// POST to specific collection (create new model)
// Insert as is into database, just adding metadata and uid
router.post("/:collectionSlug", restrict.toAuthor, function(req, res, next){
	const jwtData = {
		fields: []
	};

	const Collection = new ActiveRecord({
		tableSlug: req.params.collectionSlug
	});

	const schema = Collection.Schema;
	schema.read(req.params.collectionSlug).then(() => {
		const fields = schema.definition;
		const fieldsLength = schema.definition.length;
		let count = 0;
		// Comparing the schema with the provided data fields
		for(let i=0; i<fields.length; i++){
			const slug = fields[i].slug;
			_.each(req.body, function(el, i){
				if(slug === i){
					count++;
				}
			});
		}

		if(count !== fieldsLength){
			// Schema mismatched
			return Promise.reject(new CharError("Invalid Schema", `The provided fields does not match schema entry of ${req.params.collectionSlug} in the database`, 400));
		}else{
			// Schema matched continue processing
			// Check for file upload field
			_.each(fields, function(el, i){
				if(el.type == "files"){
					// Record the fields and also the data path intended(?)
					jwtData.fields.push({
						field: req.body[el.slug]
					});
				}
			});
			return Promise.resolve();
		}
	}).then(() => {
		// Process data
		const data = req.body;

		// Create metadata
		data._metadata = {
			created_by: req.user.username,
			date_created: moment.utc().format(),
			date_modified: moment.utc().format()
		};

		// Insert data
		const model = new Collection.Model(data);
		return model.save().then(() => {
			return Promise.resolve(model.data);
		});

		// PENDING: update user model to relfect ownership of model
		// 	// Update user schema
		// 	db.collection("_users_auth").updateOne({"username": req.user.username}, {
		// 		$addToSet:{
		// 			models: `${req.params.collectionSlug}.${data._uid}`
		// 		}
		// 	});
	}).then((data) => {
		res.json(data);
	});
});

// POST to specific model in a collection (edit existing model)
router.post("/:collectionSlug/:modelID", restrict.toAuthor, function(req, res, next){
	const promises = [];
	if(req.user.role != "administrator" && req.user.role != "editor"){
		promises.push(ownModel(req.user.username, req.params.collectionSlug, req.params.modelID));
	}

	const data = req.body;

	Promise.all(promises).then(function(val){
		const Schema = new ActiveRecord({
			tableSlug: "_schema"
		});

		Schema.findBy({"collectionSlug": req.params.collectionSlug}).then((schema) => {
			// Check input against schema
			const fields = schema.data.fields;
			const slugs = fields.map(function(el){
				return el.slug;
			});
			const fieldsLength = fields.length;
			let valid = true;

			_.each(req.body, function(el, key){
				if(!(_.includes(slugs, key))){
					res.status(400);
					res.json({
						"message": "Invalid Schema"
					});
					valid = false;
					return false;
				}
			});

			if(valid) {
				return Promise.resolve();
			}else{
				return Promise.reject(new CharError("Invalid Schema", `The provided fields does not match schema entry of ${req.params.collectionSlug} in the database`), 400);
			}
		}).then(() => {
			const Collection = new ActiveRecord({
				tableSlug: req.params.collectionSlug
			});
			Collection.findBy({"_uid": parseInt(req.params.modelID)}).then((model) => {
				// TO DO: Case where model don't exist
				if(model.data == null){
					res.json(model.data);
					return Promise.reject(new CharError("Model not found", `Cannot edit model with ID: ${req.prarams.modelID}, model does not exist in the collection ${req.params.collectionSlug}`, 404));
				}

				// Set metadata
				model.data._metadata.date_modified = moment.utc().format();
				// Set new data into model
				for(let key in data){
					model.data[key] = data[key];
				}
				// Insert into database
				return model.save();
			}).then(() => {
				// Return with newly fetch model
				Collection.findBy({"_uid": parseInt(req.params.modelID)}).then((model) => {
					res.json(model.data);
				});
			});
		}).catch(function(err){
			next(err);
		});
	});
});


// DELETE routes
// DELETE all models in a collection
router.delete("/:collectionSlug", restrict.toAuthor, function(req, res){
	// Dangerous method
	res.json({
		message: "Implementation pending"
	});
});

// DELETE specific model in a collection
router.delete("/:collectionSlug/:modelID", restrict.toAuthor, function(req, res, next){
	const promises = [];
	if(req.user.role != "administrator" && req.user.role != "editor"){
		promises.push(ownModel(req.user.username, req.params.collectionSlug, req.params.modelID));
	}

	let data;
	Promise.all(promises).then(function(val){
		const Collection = new ActiveRecord({
			tableSlug: req.params.collectionSlug
		});
		return Collection.findBy({"_uid": parseInt(req.params.modelID)});
	}).then((model) => {
		const retModel = _.cloneDeep(model.data);
		model.destroy().then((col) => {
			res.json(retModel);
		});
	}).catch(function(err){
		next(err);
	});
});


// Default
router.use("/", function(req, res){
	res.json({
		message: "Invalid route"
	});
});

module.exports = router;


// Utils
function ownModel(username, collectionSlug, modelID){
	const Collection = new ActiveRecord({
		tableSlug: collectionSlug
	});
	return Collection.findBy({"username": username}).then((user) => {
		if(_.includes(user.models, `${collectionSlug}.${modelID}`)){
			return Promise.resolve();
		}else{
			return Promise.reject(new CharError("Forbidden", "User not allowed to modify this resource", 403));
		}
	});
}