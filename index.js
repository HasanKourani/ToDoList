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

const tasksSchema = new mongoose.Schema({
  name: String,
  user: {type: mongoose.Schema.Types.ObjectId, ref:"User"}
});

const Task = mongoose.model("Task", tasksSchema);

const listSchema = new mongoose.Schema({
  name: String,
  items: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task'}],
  user: [{type: mongoose.Schema.Types.ObjectId, ref: 'User'}]
});

const List = mongoose.model("List", listSchema);

const usersSchema = new mongoose.Schema({
  email: String,
  password: String,
  googleId: String,
  lists: [{type: mongoose.Schema.Types.ObjectId, ref: "List"}],
  tasks: [{type: mongoose.Schema.Types.ObjectId, ref: "Task"}]
});

usersSchema.plugin(passportLocalMongoose);
usersSchema.plugin(findOrCreate);

const User = mongoose.model("User", usersSchema);

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

app.post("/register", (req, res)=>{
  User.register({username: req.body.username}, req.body.password, function(err, user) {
    if (err) { 
      console.log(err);
      res.redirect("/register");
     } else {
      const newList = new List({
        name: "Main",
        items: defaultTasks,
        user: user._id
      });
      const newTask = new Task({
        name: "Welcome to your List",
        user: user._id
      });
      Promise.all([newList.save(), newTask.save()]).then(()=>{
        user.lists.push(newList);
        user.tasks.push(newTask);
        user.save();
      }).then(()=>{
        passport.authenticate("local")(req, res, function(){
          res.redirect("/main");
        });
      }).catch(err => console.log(err));
     }
    });
  });

app.get("/login", (req, res)=>{
  res.render("login");
});

app.post("/login", (req, res)=>{
  const user = new User({
    username: req.body.username,
    password: req.body.password
  });

  req.login(user, function(err){
    if(err){
      console.log(err);
    } else {
      passport.authenticate("local", { failureRedirect: '/login', failureMessage: true })(req, res, function(){
        res.redirect("/main");
      });
    }
  });
});

app.get("/main", async (req, res) => {

  if(req.isAuthenticated()){
    try{
      const user = req.user;
      console.log('User:', user); 
      const foundUser = await User.populate(user, {path: "lists tasks"});
      console.log('Found User:', foundUser);

       res.render("main.ejs", {
          list: foundUser.tasks,
          day: day,
          listTitle: listTitle,
          lists: foundUser.lists
       });
     } catch (error){
     console.error("Error:", error);
    }
  } else {
    res.redirect("/login"); 
  }
});

app.post("/addTask", async (req, res) => {
  const taskName = req.body.task;
  const listName = req.body.list;

  if(!req.isAuthenticated()){
    res.redirect("/login");
  }

  const user = req.user;

  try{
    const userList = await List.findOne({name: listName, user: user._id});

    if(!userList){
      res.redirect("/main");
    } else {

    const task = new Task({
      name: taskName,
      user: user._id
    });

    await task.save();

    userList.items.push(task);
    await userList.save();
  }
  } catch (error) {
    console.log("Error: ", error);
    res.redirect("/main");
  }
});

app.post("/editTask", async (req,res)=>{
  const editTaskId = req.body.task;
  const editedTask = req.body.editedTask;
  const listName = req.body.listName;

  if(!req.isAuthenticated()){
    res.redirect("login");
  }

  const user = req.user;

  try{
    let updateQuery;
    if(listName === "Main"){
      updateQuery = {_id: editTaskId, user: user._id}
    } else {
      updateQuery = {_id: editTaskId, user: user._id, "items._id": editTaskId}
    }

    const updatedTask = await Task.findOneAndUpdate(updateQuery, {name: editedTask}, {new: true});

    if(!updatedTask){
      res.redirect("/main");
    }

    if (listName === "Main") {
      res.redirect("/main");
    } else {
      res.redirect("/" + listName);
    }
    } catch (error) {
    console.error("Error:", error);
    res.redirect("/main");
  }
});

app.post("/deleteTask", (req, res) => {
  const deletedTaskId = req.body.task;
  const listName = req.body.listName;

  if(!req.isAuthenticated()){
    res.redirect("login");
  }

  const user = req.user;

  try{
    let deleteQuery;
    if (listName === "Main"){
      deleteQuery = {id: deletedTaskId, user: user._id}
    } else {
      deleteQuery = {id: deletedTaskId, user: user._id, "items._id": deletedTaskId}
    }

    const deletedTask = Task.findOneAndDelete(deleteQuery);

    if(!deletedTask){
      res.redirect("/main");
    }
    if (listName === "Main") {
      res.redirect("/main");
    } else {
      res.redirect("/" + listName);
    }
    } catch (error) {
    console.error("Error:", error);
    res.redirect("/main");
  }
});

app.get("/:customListName", async (req,res)=>{
  const customListName = _.capitalize(req.params.customListName);

  if (!req.isAuthenticated()) {
    res.redirect("/login");
  }

  const user = req.user;

  try {
    const foundList = await List.findOne({name: customListName, user: user._id});

    if (!foundList){
      res.redirect("/" + customListName);
    } else {

    res.render("main.ejs",
    {
      listTitle: foundList.name,
      list: foundList.items,
      day: day,
      lists: user.lists
    });
    }
  } catch (error) {
    console.log(error);
    res.redirect("/main");
  }
}); 

app.post("/newList", async(req,res)=>{
  const newListName = _.capitalize(req.body.newListName);

  if(!req.isAuthenticated()){
    res.redirect("login");
  }

  const user = req.user;

  try{
    const existingList = await List.findOne({name: newListName, user: user._id});

    if(existingList){
      res.redirect("/main")
    } else {

    const newList = new List({
      name: newListName,
      items: defaultTasks,
      user: user._id
    });

    await newList.save();

    user.lists.push(newList);
    await user.save();

    res.redirect("/"+newListName);
  }

  } catch (error) {
    console.error("Error:", error);
    res.redirect("/main");
  }
});

app.post("/createNewList", (req, res) => {
  res.render("newList",{
  });
});

app.post("/logout", (req,res)=>{
  req.logOut(function(err){
    if(err){
      console.log(err);
    }
    res.redirect("/"); 
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}.`);
});
