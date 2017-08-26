const _ = require("lodash");
const express = require("express");
const moment = require("moment");
const router = express.Router();
const connect = require("../../utils/database.js");
const Promise = require("bluebird");
const autoIncrement = require("mongodb-autoincrement");
Promise.promisifyAll(autoIncrement);

// Route: {root}/api/collections/...

// GET routes
// GET collection with slug
router.get("/:collectionSlug", function(req, res){
	connect.then(function(db){
		return db.collection(req.params.collectionSlug).find().toArray();
	}).then(function(data){
		res.json(data);
	});
});

// GET specific model from a collection
router.get("/:collectionSlug/:modelID", function(req, res){
	connect.then(function(db){
		return db.collection(req.params.collectionSlug).findOne({"_uid": parseInt(req.params.modelID)});
	}).then(function(data){
		res.json(data);
	});
});


// POST routes
// POST to specific collection (create new model)
// Insert as is into database, just adding metadata and uid
router.post("/:collectionSlug", function(req, res){
	// Check schema
	connect.then(function(db){
		return db.collection("_schema").findOne({"collectionSlug": req.params.collectionSlug})
			.then(function(data){
			var fields = data.fields;
			var fieldsLength = data.fields.length;
			var count = 0;

			for(let i=0; i<fields.length; i++){
				let slug = fields[i].slug;
				_.each(req.body, function(el, i){
					if(slug === i){
						count++;
					}
				});
			}

			if(count === fieldsLength){
				// Schema matched
				return Promise.resolve(db);
			}else{
				res.status(400);
				res.json({
					"message": "Invalid Schema"
				});
			}
		});

	}).then(function(db){
		let data = req.body;

		// Create metadata
		data._metadata = {
			created_by: "admin",
			date_created: moment.utc().format(),
			date_modified: moment.utc().format()
		};

		// Set increment index (should be abstracted if RDBS is to be used)
		autoIncrement.setDefaults({collection: "_counters"});
		return autoIncrement.getNextSequenceAsync(db, req.params.collectionSlug).then(function(autoIndex){
			// Set unique auto incrementing index
			data._uid = autoIndex;
			return Promise.resolve(db);

		}).then(function(db){
			// Insert data into database
			return db.collection(req.params.collectionSlug).insertOne(data).then(function(){
				return Promise.resolve(data);
			});
		});
	}).then(function(data){
		// Data insertion successful
		res.json(data);
	});
});

// POST to specific model in a collection (edit existing model)
router.post("/:collectionSlug/:modelID", function(req, res){
	let data = req.body;

	connect.then(function(db){
		return db.collection("_schema").findOne({"collectionSlug": req.params.collectionSlug}).then(function(model){
			// Validate with schema
			var fields = model.fields;
			var slugs = fields.map(function(el){
				return el.slug;
			});
			var fieldsLength = model.fields.length;
			var valid = true;

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

			if(valid){
				return Promise.resolve(db);
			}else{
				return Promise.reject(new Error("Invalid Schema"));
			}
		});

	}).then(function(db){
		// TO DO: Case where model don't exist
		// Set metadata
		return db.collection(req.params.collectionSlug).findOne({"_uid": parseInt(req.params.modelID)}).then(function(model){
			if(model == null){
				res.json(model);
				return Promise.reject(new Error("Model not found"));
			}
			data._metadata = model._metadata;
			data._metadata.date_modified = moment.utc().format();
			return Promise.resolve(db);
		});
	}).then(function(db){
		// Insert into database
		return db.collection(req.params.collectionSlug).updateOne({"_uid": parseInt(req.params.modelID)}, {$set: data}).then(function(){
			return Promise.resolve(db);
		});
	}).then(function(db){
		// Return updated model
		db.collection(req.params.collectionSlug).findOne({"_uid": parseInt(req.params.modelID)}).then(function(model){
			res.json(model);
		});
	}).catch(function(err){

	});
});


// DELETE routes
// DELETE all models in a collection
router.delete("/:collectionSlug", function(req, res){
	// connect.then(function(db){
	// 	return db.collection(req.params.collectionSlug).deleteMany({});
	// }).then(function(){
	// 	res.json({
	// 		message: "Deleted all"
	// 	});
	// });

	// Dangerous method
	res.json({
		message: "Implementation pending"
	});
});

// DELETE specific model in a collection
router.delete("/:collectionSlug/:modelID", function(req, res){
	var data;
	connect.then(function(db){
		return db.collection(req.params.collectionSlug).findOne({"_uid": parseInt(req.params.modelID)}).then(function(model){
			data = model;
			return Promise.resolve(db);
		});
	}).then(function(db){
		return db.collection(req.params.collectionSlug).deleteOne({"_uid": parseInt(req.params.modelID)});
	}).then(function(){
		res.json(data);
	});
});


// Default
router.use("/", function(req, res){
	res.json({
		message: "Invalid route"
	});
});

module.exports = router;