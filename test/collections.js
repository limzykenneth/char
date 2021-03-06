const DynamicRecord = require("dynamic-record");
const chai = require("chai");
const _ = require("lodash");
const chaiHttp = require("chai-http");
chai.use(chaiHttp);
const assert = chai.assert;

const testData = Object.freeze(_.cloneDeep(require("./json/test_1_data.json")));
const testAppCollection = require("./json/test_1_AppCollection.json");
const testSchema = require("./json/test_1.schema.json");
const TestSchema = new DynamicRecord.DynamicSchema();

const fileAppCollection = require("./json/test_2_AppCollection.json");
const fileSchema = require("./json/test_2.schema.json");
const FileSchema = new DynamicRecord.DynamicSchema();

const newModel = Object.freeze({
	"field_1": "<p>Fish cake coleslaw roe, chicken burger skate battered roe roe roe jacket potato gravy beef burger. </p>",
	"field_2": "chicken burger peas fish cake",
	"field_3": "mayonaisemayonaise@hotmail.com",
	"field_4": [
		"three"
	],
	"field_5": "two"
});

const app = require("../app.js");

describe("Collections Routes", function(){
	let token, Test1, AppCollections;

	// Setup
	before(async function() {
		// Create test collections' schemas
		await Promise.all([
			TestSchema.createTable(testSchema),
			FileSchema.createTable(fileSchema)
		]);

		const res = await chai.request(app).post("/api/tokens/generate_new_token").send({
			"username": "admin",
			"password": "admin"
		});
		token = res.body.access_token;

		// Populate test_1 table with data
		Test1 = new DynamicRecord({
			tableSlug: "test_1"
		});
		const col = new DynamicRecord.DynamicCollection(Test1.Model, ..._.cloneDeep(testData));
		await col.saveAll();

		// Create app collection entries
		AppCollections = new DynamicRecord({
			tableSlug: "_app_collections"
		});
		const Test1AppCollection = new AppCollections.Model(testAppCollection);
		await Test1AppCollection.save();

		const FileAppCollection = new AppCollections.Model(fileAppCollection);
		await FileAppCollection.save();
	});

	// Cleanup
	after(async function() {
		// Clean out test data
		const cols = await Test1.all();
		await cols.dropAll();

		// Remove all app collection entries
		const col = await AppCollections.all();
		const promises = col.map((el) => {
			return el.destroy();
		});
		await Promise.all(promises);

		// Clean out test collections' schemas
		await Promise.all([
			TestSchema.dropTable(),
			FileSchema.dropTable()
		]);
	});

	/////////////////////////////////////////
	//             Test suites             //
	/////////////////////////////////////////
	describe("GET /api/collections/:slug/", function(){
		it("should retrieve all available models under the specified collection", function(){
			return chai.request(app).get("/api/collections/test_1").set("Content-Type", "application/json").set("Authorization", `Bearer ${token}`).then((res) => {
				assert.lengthOf(res.body, testData.length, "returned object has the expected length");
				_.find(testData, {"field_3": "onionpie@hotmail.com"})._uid = 1;
				_.find(testData, {"field_3": "batteredsaveloy@gmail.com"})._uid = 2;

				_.each(res.body, (el) => {
					assert.deepInclude(testData, el, "returns the expected data");
				});
			});
		});
	});

	describe("GET /api/collections/:slug/:ID", function(){
		it("should retrieve only the model specified by the provided ID", function(){
			return chai.request(app).get("/api/collections/test_1/1").set("Content-Type", "application/json").set("Authorization", `Bearer ${token}`).then((res) => {
				let model = _.find(testData, {"field_3": "onionpie@hotmail.com"});
				model._uid = 1;
				assert.deepEqual(res.body, model, "returns the expected model");
			});
		});
		it("should return a 404 in the case of non existing model", function(){
			return chai.request(app).get("/api/collections/test_1/3").set("Content-Type", "application/json").set("Authorization", `Bearer ${token}`).then((res) => {
				assert.equal(res.status, 404, "returns with status code 404");
				assert.equal(res.body.title, "Model does not exist", "returns with correct message");
			});
		});
	});

	describe("POST /api/collections/:slug", function(){
		afterEach(async function(){
			const model = await Test1.findBy({"_uid": 3});
			if(model !== null){
				await model.destroy();
			}
		});
		it("should create a new model under the specified collection", async function(){
			const res = await chai.request(app)
				.post("/api/collections/test_1")
				.set("Content-Type", "application/json")
				.set("Authorization", `Bearer ${token}`)
				.send(newModel);

			// Check the returned data
			assert.equal(res.body._uid, 3, "returns the correct uid");
			assert.equal(res.body.field_1, newModel.field_1, "returns the correct WYSIWYG field data");
			assert.equal(res.body.field_2, newModel.field_2, "returns the correct text field data");
			assert.equal(res.body.field_3, newModel.field_3, "returns the correct email field data");
			assert.deepEqual(res.body.field_4, newModel.field_4, "returns the correct checkbox field data");
			assert.equal(res.body.field_5, newModel.field_5, "returns the correct radiobox field data");

			const model = await Test1.findBy({_uid: 3});
			assert.equal(model.data.field_1, newModel.field_1, "database has the correct WYSIWYG field data");
			assert.equal(model.data.field_2, newModel.field_2, "database has the correct text field data");
			assert.equal(model.data.field_3, newModel.field_3, "database has the correct email field data");
			assert.deepEqual(model.data.field_4, newModel.field_4, "database has the correct checkbox field data");
			assert.equal(model.data.field_5, newModel.field_5, "database has the correct radiobox field data");
		});
		it("should reject a model with the wrong schema with a 400 response", async function(){
			const rejectModel = {
				field_1: 12
			};
			const res = await chai.request(app)
				.post("/api/collections/test_1")
				.set("Content-Type", "application/json")
				.set("Authorization", `Bearer ${token}`)
				.send(rejectModel);

			assert.equal(res.status, 400, "returns with status code 400");
			assert.equal(res.body.title, "Invalid Schema", "returns with correct message");
		});

		describe("File upload fields", function(){
			let FilesUpload;
			const fileModel = Object.freeze({
				"field_1": "Roe battered skate nuggets chips battered cod",
				"field_2": [{
					"file_name": "image-1.jpg",
					"file_description": "Test image 1",
					"content-type": "image/jpeg"
				}]
			});

			before(async function(){
				FilesUpload = new DynamicRecord({
					tableSlug: "files_upload"
				});
			});

			after(async function(){
				const filesMetadata = await FilesUpload.all();
				filesMetadata.dropAll();
			});

			afterEach(async function(){
				const Test2 = new DynamicRecord({
					tableSlug: "test_2"
				});

				const col = await Test2.all();
				await col.dropAll();
			});

			it("should reponse to file upload fields with upload URL", async function(){
				const res = await chai.request(app)
					.post("/api/collections/test_2")
					.set("Content-Type", "application/json")
					.set("Authorization", `Bearer ${token}`)
					.send(fileModel);

				assert.equal(res.status, 200, "return with status code 200");
				assert.exists(res.body.field_2[0].permalink, "file permalink is returned");
				assert.exists(res.body.field_2[0].upload_link, "file upload link is returned");
				assert.exists(res.body.field_2[0].upload_expire, "file expire timestamp is returned");
			});
			it("should create file upload metadata entry given file upload fields", async function(){
				const res = await chai.request(app)
					.post("/api/collections/test_2")
					.set("Content-Type", "application/json")
					.set("Authorization", `Bearer ${token}`)
					.send(fileModel);

				const id = res.body.field_2[0].uid;
				const file = await FilesUpload.findBy({uid: id});
				assert.isNotNull(file, "file metadata entry found in database");
			});
			it("should return an error if provided file metadata does not have acceptable MIME type", async function(){
				const rejectModel = _.cloneDeep(fileModel);
				rejectModel.field_2[0]["content-type"] = "application/json";

				const res = await chai.request(app)
					.post("/api/collections/test_2")
					.set("Content-Type", "application/json")
					.set("Authorization", `Bearer ${token}`)
					.send(rejectModel);

				assert.equal(res.status, 415, "return with status code 415");
			});
		});
	});

	describe("POST /api/collections/:slug/:ID", function(){
		it("should edit the exisitng model in the collection specified by the provided ID", function(){
			return chai.request(app)
				.post("/api/collections/test_1")
				.set("Content-Type", "application/json")
				.set("Authorization", `Bearer ${token}`)
				.send(newModel)
				.then((res) => {
					const modifyModel = res.body;
					modifyModel.field_2 = "Changed this field";

					return chai.request(app)
						.post("/api/collections/test_1/4")
						.set("Content-Type", "application/json")
						.set("Authorization", `Bearer ${token}`)
						.send(modifyModel);
				}).then((res) => {
					assert.equal(res.body.field_2, "Changed this field", "field is changed in response");

					return chai.request(app)
						.get("/api/collections/test_1/4")
						.set("Content-Type", "application/json")
						.set("Authorization", `Bearer ${token}`);
				}).then((res) => {
					assert.equal(res.body.field_2, "Changed this field", "field is changed in response");
				});
		});
		it("should reject a model with the wrong schema with a 400 response", function(){
			return chai.request(app)
				.post("/api/collections/test_1")
				.set("Content-Type", "application/json")
				.set("Authorization", `Bearer ${token}`)
				.send(newModel)
				.then((res) => {
					const modifyModel = res.body;
					modifyModel.field_2 = 24;

					return chai.request(app)
						.post("/api/collections/test_1/5")
						.set("Content-Type", "application/json")
						.set("Authorization", `Bearer ${token}`)
						.send(modifyModel);
				}).then((res) => {
					assert.equal(res.status, 400, "returns with status code 400");
					assert.equal(res.body.title, "Invalid Schema", "returns with correct message");
				});
		});

		describe("File upload fields", function(){
			let FilesUpload, Test2;
			const fileModel = Object.freeze({
				"field_1": "Roe battered skate nuggets chips battered cod",
				"field_2": [{
					"file_name": "image-1.jpg",
					"file_description": "Test image 1",
					"content-type": "image/jpeg"
				}]
			});

			before(async function(){
				FilesUpload = new DynamicRecord({
					tableSlug: "files_upload"
				});
				Test2 = new DynamicRecord({
					tableSlug: "test_2"
				});
			});

			after(async function(){
				const filesMetadata = await FilesUpload.all();
				filesMetadata.dropAll();
			});

			afterEach(async function(){
				const col = await Test2.all();
				await col.dropAll();
			});

			it("should update the file entry if it was changed");
		});
	});

	describe("DEL /api/collections/:slug/:ID", function(){
		it("should delete the existing model in the collection specified by the provided ID", function(){
			return chai.request(app)
				.post("/api/collections/test_1")
				.set("Content-Type", "application/json")
				.set("Authorization", `Bearer ${token}`)
				.send(newModel)
				.then((res) => {
					return chai.request(app)
						.delete("/api/collections/test_1/6")
						.set("Content-Type", "application/json")
						.set("Authorization", `Bearer ${token}`);
				}).then((res) => {
					return chai.request(app)
						.get("/api/collections/test_1/6")
						.set("Content-Type", "application/json")
						.set("Authorization", `Bearer ${token}`);
				}).then((res) => {
					assert.equal(res.status, 404, "returns with status code 404");
					assert.equal(res.body.title, "Model does not exist", "returns with correct message");
				});
		});
		it("should return a 404 in the case of non existing model", function(){
			return chai.request(app)
				.delete("/api/collections/test_1/10")
				.set("Content-Type", "application/json")
				.set("Authorization", `Bearer ${token}`)
				.then((res) => {
					assert.equal(res.status, 404, "returns with status code 404");
					assert.equal(res.body.title, "Model does not exist", "returns with correct message");
				});
		});
	});
});