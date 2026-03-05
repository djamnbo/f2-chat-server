const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');

const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');

const app = express();

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// 기본 라우트 연결
app.use('/', indexRouter);
app.use('/users', usersRouter);

// ⚠️ 기존에 있던 404 및 에러 핸들러 코드를 삭제했습니다.
// (이 부분은 services/auth.js의 라우트 정의 이후로 이동합니다)

module.exports = app;