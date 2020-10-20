const DynamicRecord = require("dynamic-record");
const _ = require("lodash");
const testSchema = require("./json/test_1.schema.json");
const testAppCollection = require("./json/test_1_AppCollection.json");
const testData = Object.freeze(_.cloneDeep(require("./json/test_1_data.json")));
const testImageData = _.cloneDeep(require("./json/file_data.json"));

let AppCollections;
let FileUpload;
const TestSchema = new DynamicRecord.DynamicSchema();

before(function(){
	const promises = [
		TestSchema.createTable(testSchema)
	];

	return Promise.all(promises).then(() => {
		FileUpload = new DynamicRecord({
			tableSlug: "files_upload"
		});
		AppCollections = new DynamicRecord({
			tableSlug: "_app_collections"
		});
		const Test1AppCollection = new AppCollections.Model(testAppCollection);

		const Test1 = new DynamicRecord({
			tableSlug: "test_1"
		});

		const col = _.map(testData, (el) => {
			return new Test1.Model(el);
		});

		files = new FileUpload.Model(testImageData);
		// console.log(files);

		return Promise.all([
			files.save(),
			Test1AppCollection.save(),
			col[0].save().then(() => {
				col[1].save();
			})
		]);
	});
});

after(function(){
	const appCollectionsCleanup = AppCollections.all().then((col) => {
		const promises = [];
		col.forEach((el) => {
			promises.push(el.destroy());
		});
		return Promise.all(promises);
	});

	const fileUploadCleanup = FileUpload.all().then((col) => {
		const promises = [];
		col.forEach((el) => {
			promises.push(el.destroy());
		});
		return Promise.all(promises);
	});

	const dropTestSchema = TestSchema.dropTable();

	return Promise.all([appCollectionsCleanup, fileUploadCleanup, dropTestSchema]).then(() => {
		FileUpload.closeConnection();
	});
});

// Reset database state after each test
afterEach(function(){
	const Test1 = new DynamicRecord({
		tableSlug: "test_1"
	});

	return Test1.findBy({"_uid": 3}).then((model) => {
		if(model !== null){
			return model.destroy();
		}else{
			return Promise.resolve();
		}
	});
});