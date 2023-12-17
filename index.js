require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const _ = require("lodash");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require("mongoose-findorcreate");

const app = express();
const port = 3000;

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

app.use(session({
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect("mongodb://0.0.0.0:27017/toDoListDB");

const usersSchema = new mongoose.Schema({
  email: String,
  password: String,
  googleId: String
});

usersSchema.plugin(passportLocalMongoose);
usersSchema.plugin(findOrCreate);

const User = mongoose.model("User", usersSchema);

const tasksSchema = new mongoose.Schema({
  name: String,
});

const Task = mongoose.model("Task", tasksSchema);

const listSchema = {
  name: String,
  items: [tasksSchema]
};

const List = mongoose.model("List", listSchema);

passport.use(User.createStrategy());

passport.serializeUser(function(user, cb) {
  process.nextTick(function() {
    return cb(null, {
      id: user.id,
      username: user.username,
      picture: user.picture
    });
  });
});

passport.deserializeUser(function(user, cb) {
  process.nextTick(function() {
    return cb(null, user);
  });
});

const defTask = new Task({
  name: "Welcome to your List",
});
  
const defaultTasks = [defTask];


const weekday = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const d = new Date();
const day =
  weekday[d.getDay()] +
  ", " +
  months[d.getMonth()] +
  " " +
  d.getDate() +
  ", " +
  new Date().getFullYear();

  const listTitle = "Main";


app.get("/", (req, res)=>{
  res.render("home");
});  

app.get("/register", (req, res)=>{
  res.render("register");
});

app.get("/login", (req, res)=>{
  res.render("login");
});

app.get("/main", async (req, res) => {

  try{

    const [foundTasks, foundLists] = await Promise.all([
      Task.find({}),
      List.find({})
    ]);

    if(foundTasks.length===0){
      await Task.insertMany(defaultTasks);
      res.redirect("/main");
    } else {
      res.render("main.ejs", {
        list: foundTasks,
        day: day,
        listTitle: listTitle,
        lists: foundLists
      });
    }
  } catch(error){
    console.error("Error:", error);
  }

});

app.post("/addTask", (req, res) => {
  const taskName = req.body.task;
  const listName = req.body.list;

  const task = new Task({ 
    name: taskName
  });

  if(listName === "Main"){
    task.save();
    res.redirect("/main");
  } else {
    List.findOne({name: listName}).then(foundList =>{
      foundList.items.push(task);
      foundList.save();
      res.redirect("/" + listName);
    });
  }
});

app.post("/editTask", (req,res)=>{
  const editTaskId = req.body.task;
  const editedTask = req.body.editedTask;
  const listName = req.body.listName;

  if(listName === "Main"){
    Task.findByIdAndUpdate(editTaskId, {name: editedTask}).then(result =>{
      console.log("Task Updated");  
    });
    res.redirect("/main");
  } else {
    List.findOneAndUpdate({name: listName, "items._id":editTaskId}, {$set: {"items.$.name": editedTask}}).then(result =>{
      console.log("Task Updated");
    });
    res.redirect("/"+listName);
  }
  
});

app.post("/deleteTask", (req, res) => {
  const deletedTaskId = req.body.task;
  const listName = req.body.listName;

  if(listName === "Main"){
    Task.findByIdAndDelete(deletedTaskId).then(result=>{
      console.log("Task Deleted");
    });
    res.redirect("/main");
  } else {
    List.findOneAndUpdate({name: listName}, {$pull: {items: {_id: deletedTaskId}}}).then(result =>{
      console.log("Task Deleted");
    });
    res.redirect("/"+listName);
  }
});

 app.get("/:customListName", async (req,res)=>{
  const customListName = _.capitalize(req.params.customListName);

  try{
    const [foundList, foundLists] = await Promise.all([
      List.findOne({name: customListName}),
      List.find({})
    ]);
    if(!foundList){
      const list = new List({
        name: customListName,
        items: defaultTasks
      });
      list.save();
      res.redirect("/"+customListName);
    } else {
      res.render("main.ejs", {
        listTitle: foundList.name, 
        list: foundList.items,
        day: day,
        lists: foundLists
      });
    }
  } catch(error){
    console.error("Error: ", error);
  }
}); 

app.post("/newList", async(req,res)=>{
  const newListName = _.capitalize(req.body.newListName);

  try{
    const [foundList, foundLists] = await Promise.all([
      List.findOne({name: newListName}),
      List.find({})
    ]);
    if(!foundList){
      const list = new List({
        name: newListName,
        items: defaultTasks
      });
      list.save();
      res.render("main.ejs", {
        listTitle: newListName,
        list: defaultTasks, 
        day: day,
        lists: foundLists
      });
    } else {
      res.render("main.ejs", {
        listTitle: foundList.name, 
        list: foundList.items,
        day: day,
        lists: foundLists
      });
    }
  } catch(error){
    console.error("Error: ", error);
  }
});

app.post("/createNewList", (req, res) => {
  res.render("newList.ejs",{
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}.`);
});
