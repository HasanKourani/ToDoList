require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const dirname = require("path");
const mongoose = require("mongoose");
const _ = require("lodash");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require("mongoose-findorcreate");

const app = express();
const port = 3000;

app.use(express.static(__dirname + "/public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

app.use(session({
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect(process.env.DB_URI); 

const tasksSchema = new mongoose.Schema({
  name: String,
});

const Task = mongoose.model("Task", tasksSchema);

const listSchema = new mongoose.Schema({
  name: String,
  items: [tasksSchema],
  user: [{type: mongoose.Schema.Types.ObjectId, ref:"User"}]
});

const List = mongoose.model("List", listSchema);

const usersSchema = new mongoose.Schema({
  email:{
    type: String
  },
  password:{
    type: String,
    min: 6,
  },
  googleId: String
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

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
  userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
},
function(accessToken, refreshToken, profile, cb) {
  User.findOrCreate({ googleId: profile.id }, function (err, user) {
    return cb(err, user);
  });
}
));

const weekday = [
  "Sun",
  "Mon",
  "Tues",
  "Wed",
  "Thur",
  "Fri",
  "Sat",
];
const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "June",
  "July",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
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


app.get("/", (req, res)=>{
  res.render("home");
});

app.get("/auth/google",
  passport.authenticate("google", { scope: ["profile"] })
);

app.get("/auth/google/todolist", 
  passport.authenticate("google", { failureRedirect: "/login" }),
  function(req, res) {
    res.redirect("/main");
  });

app.get("/register", (req, res) => {
  res.render("register");
});

app.post("/register", (req,res) => {
  User.register({username: req.body.username}, req.body.password, function(err, user){
    if(err) {
      console.log(err);
      res.redirect("/register.ejs");
    } else {
      passport.authenticate("local")(req, res, function(){
        res.redirect("/main");
      });
    }
  });
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/login", passport.authenticate("local", {
  successRedirect: "/main",
  failureRedirect: "/login"
}));

app.get("/main", async (req, res) => {
  if(!req.isAuthenticated()){
    res.redirect("/login");
  } else {
  try {
    const listTitle = "Main";
    const user = req.user;
    const lists = await List.find({user: user.id});
    let allTasks = [];
    for (const list of lists){
      allTasks = allTasks.concat(list.items);
    }
    res.render("main", {
      tasks: allTasks,
      lists: lists,
      today: day,
      title: listTitle
    });
  } catch (err){
  console.log(err);
  } }
});

app.post("/addTask", async (req, res) => {
  if(!req.isAuthenticated()){
    res.redirect("/login");
  } else {
  const taskName = req.body.task;
  const listName = req.body.listName;
  const user = req.user;
  try{
    const task = new Task({ 
      name: taskName
    });
    if(listName === "Main") {
      await List.findOneAndUpdate(
        {user: user.id, name: listName},
        {$push: {items: task}});
      res.redirect("/main");
    } else {
      await List.findOneAndUpdate(
        {user: user.id, name: listName},
        {$push: {items: task}});
      res.redirect("/" + listName);
    }
  } catch (err) {
    console.log(err); 
  }}
});

app.post("/editTask", async (req,res)=>{
  if(!req.isAuthenticated()){
    res.redirect("/login");
  }
  const editTaskId = req.body.task;
  const editedTask = req.body.editedTask;
  const listName = req.body.listName;
  const user = req.user;
  try{
    if(listName === "Main"){
      await List.findOneAndUpdate(
        {user: user.id, name:"Main", "items._id": editTaskId}, 
        {$set: {"items.$.name": editedTask}});
      res.redirect("/main");
    } else {
      await List.findOneAndUpdate(
        {user: user.id ,name: listName, "items._id":editTaskId}, 
        {$set: {"items.$.name": editedTask}});
      res.redirect("/"+listName);
    }
  } catch (err) {
    console.log(err);
  }
});

app.post("/deleteTask", async (req, res) => {
  if(!req.isAuthenticated()){
    res.redirect("/login");
  }
  const deletedTaskId = req.body.task;
  const listName = req.body.listName;
  const user = req.user;
  try{
    if(listName === "Main"){
      await List.findOneAndUpdate(
        {user: user.id, name: "Main", "items._id":deletedTaskId},
        {$pull: {items: {_id: deletedTaskId}}});
      res.redirect("/main");
    } else {
      await List.findOneAndUpdate(
        {user: user.id, name: listName, "items._id":deletedTaskId},
        {$pull: {items: {_id: deletedTaskId}}});
      res.redirect("/"+listName);
    }
  } catch (err) {
    console.log(err);
  }
});

app.get("/:customListName", async (req,res)=>{
  if(!req.isAuthenticated()){
    res.redirect("/login");
  } else {
  const customListName = _.capitalize(req.params.customListName);
  const user = req.user;
  try{
    const [foundList, foundLists] = await Promise.all([
      List.findOne({name: customListName, user: user.id}),
      List.find({user: user.id})
    ]);
    if(!foundList){
      const list = new List({
        name: customListName,
        user: user.id
      });
      list.save();
      res.redirect("/"+customListName);
    } else {
      res.render("main.ejs", {
        title: foundList.name, 
        tasks: foundList.items,
        today: day,
        lists: foundLists
      });
    }
  } catch(error){
    console.error("Error: ", error);
  }}
});

app.post("/newList", async(req,res)=>{
  if(!req.isAuthenticated()){
    res.redirect("/login");
  }
  const newListName = _.capitalize(req.body.newListName);
  try { 
    const user = req.user;
    const [foundList, foundLists] = await Promise.all([
      List.findOne({ user: user.id, name: newListName }),
      List.find({ user: user.id }),
    ]);
    const deftasks = [];
    if(!foundList){
      const list = new List({
        name: newListName,
        user: user.id
      });
      await list.save();
      res.render("main",{
        title: newListName,
        tasks: deftasks,
        today: day,
        lists: foundLists
      });
    } else {
      res.render("main.ejs", {
        title: foundList.name, 
        tasks: foundList.items,
        today: day,
        lists: foundLists
      });
    }
  } catch(error) {
    console.error("Error: ", error);
  }
});

app.post("/createNewList", (req, res) => {
  res.render("newList.ejs",{
  });
});

app.post("/deleteNewList", async (req, res) => {
  if(!req.isAuthenticated()){
    res.redirect("/login");
  }
  const listDeleteId = req.body.listId;
  const user = req.user;
  const listName = req.body.listName;
  try{
      const foundList = await List.findOneAndDelete(
        {user: user.id, name: listName, _id: listDeleteId});  
      res.redirect("/main");
    } catch (err) {
    console.log(err);
  }
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
