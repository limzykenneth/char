const _ = require("lodash");
const express = require("express");
const ActiveRecord = require("active-record");
const DynamicRecord = require("dynamic-record");

const router = express.Router();
const restrict = require("../../utils/middlewares/restrict.js");
const Schemas = new ActiveRecord({
	tableSlug: "_schema"
});
const ActiveSchema = ActiveRecord.ActiveSchema;
const AppCollections = new DynamicRecord({
	tableSlug: "_app_collections"
});

//-----------------------
// Pattern here is not in line with implemented active record pattern -----------
//-----------------------
// Route: {root}/api/schema/...

// GET routes
// GET all schemas
router.get("/", restrict.toEditor, function(req, res, next){
	const appSchemas = [];
	AppCollections.all().then((schemaNames) => {
		const promises = [];

		_.each(schemaNames, (schemaName) => {
			const Schema = new DynamicRecord.DynamicSchema();
			appSchemas.push(schemaName);
			promises.push(Schema.read(schemaName.data._$id));
		});

		return Promise.all(promises);
	}).then((schemas) => {
		_.each(schemas, (schema, i) => {
			const appSchema = appSchemas[i];

			delete schema.definition._metadata;
			delete schema.definition._uid;

			_.each(schema.definition, (field, key) => {
				_.each(appSchema.data.fields[key], (val, prop) => {
					field[prop] = val;
				});
			});
		});
		res.json(schemas);
	}).catch((err) => {
		next(err);
	});
});

// GET specified schema
router.get("/:schema", restrict.toEditor, function(req, res, next){
	const Schema = new DynamicRecord.DynamicSchema();

	let appSchema;
	AppCollections.findBy({"_$id": req.params.schema}).then((schemaName) => {
		appSchema = schemaName;
		return Schema.read(schemaName.data._$id);
	}).then((schema) => {
		delete schema.definition._metadata;
		delete schema.definition._uid;
		_.each(schema.definition, (field, key) => {
			_.each(appSchema.data.fields[key], (val, prop) => {
				field[prop] = val;
			});
		});

		res.json(schema);
	}).catch((err) => {
		next(err);
	});
});

// POST routes
// POST specified schema (add new and edit)
router.post("/", restrict.toEditor, function(req, res){
	const Schema = new ActiveRecord({
		tableSlug: "_schema"
	});

	// Find collection with duplicate slug, if found, edit it
	Schema.where({collectionSlug: req.body.collectionSlug}).then((schemas) => {
		if(schemas.length > 0){
			// Edit schema
			schemas[0].data = req.body;
			return schemas[0].save();
		}else{
			let table;
			// Create new schema
			return ActiveSchema.createTable({
				tableSlug: req.body.collectionSlug,
				tableName: req.body.collectionName,
				indexColumns: {
					name: "_uid",
					unique: true,
					autoIncrement: true
				}
			}).then(() => {
				return Schema.Schema.read(req.body.collectionSlug);
			}).then(() => {
				return Schema.Schema.addColumns(req.body.fields);
			});
		}
	}).then(() => {
		Schema.findBy({collectionSlug: req.body.collectionSlug}).then((schema) => {
			res.json(schema.data);
		});
	});
});

// DELETE routes
// DELETE specified schema (and all posts in it)
router.delete("/:schema", restrict.toEditor, function(req, res, next){
	const Schema = new ActiveRecord({
		tableSlug: "_schema"
	});

	// NOT INTENDED, SHOULD REMOVE!
	const Counter = new ActiveRecord({
		tableSlug: "_counters"
	});

	const promises = [];
	let collectionName;

	promises.push(Counter.findBy({collection: req.params.schema}).then((entry) => {
		return entry.destroy();
	}));

	promises.push(Schema.findBy({collectionSlug: req.params.schema}).then((schema) => {
		collectionName = schema.data.collectionName;
		return schema.destroy();
	}));

	Promise.all(promises).then(() => {
		res.json({
			status: "success",
			message: `Schema "${collectionName}" deleted.`
		});
	}).catch((err) => {
		next(err);
	});
});

module.exports = router;