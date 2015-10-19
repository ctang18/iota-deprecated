var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;

var userSchema = mongoose.Schema({
    user_id: ObjectId,
    email: { type: String, unique: true, required: true, dropDups: true },
    password: { type: String, unique: true, required: true, dropDups: true },
    settings: { display: String },
    member: { group_id: [String] },
    moderator: { group_id: [String] },
    admin: { group_id: [String] }
  });
  
  var contentSchema = mongoose.Schema({
    content_id: ObjectId,
    user_id: { type: String, unique: true, required: true, dropDups: true },
    content: String,
    post_date: { type: Date, default: Date.now },
    title: String,
    img: String,
    contentType: Number,
    tags: [String]
  });
  
  var groupSchema = Schema({
    group_id: ObjectId,
    group_name: { type: String, unique: true, required: true, dropDups: true },
    password: { type: String }
  });
  
  var groupContentSchema = Schema({
    group_content_id: ObjectId,
    group_id: { type: String, unique: true, required: true, dropDups: true },
    content: String,
    post_date: { type: Date, default: Date.now },
    title: String,
    img: String,
    contentType: Number,
    tags: [String]
  });