/**
 * Created by hajoviin on 11.5.2015.
 * Handles the controls of lecture info page
 * @module lectureInfoController
 * @author Matias Berg
 * @author Bek Eljurkaev
 * @author Minna Lehtomäki
 * @author Juhani Sihvonen
 * @author Hannu Viinikainen
 * @licence MIT
 * @copyright 2015 Timppa project authors
 */

var angular, docId, lectureId, lectureCode, lectureStartTime, lectureEndTime;

var timApp = angular.module('timApp');
timApp.controller('LectureInfoController', ['$scope', '$http', '$window', function ($scope, $http, $window) {
    "use strict";
    $scope.docId = docId;
    $scope.lectureId = lectureId;
    $scope.lectureCode = "Lecture info: " + lectureCode;
    $scope.lectureStartTime = lectureStartTime;
    $scope.lectureEndTime = lectureEndTime;
    $scope.msg = "";
    $scope.answers = "";
    $scope.userName = "";
    $scope.dynamicAnswerShowControls = [];
    $scope.dynamicAnswerShowControl = {};
    $scope.index = 0;
    $scope.isLecturer = false;
    $scope.answerers = [];
    $scope.showPoints = false;
    $scope.points = [];

    /**
     * Sends http request to get info about the specific lecture.
     * @memberof module:lectureInfoController
     */
    $scope.getLectureInfo = function () {
        $http({
            url: '/getLectureInfo',
            type: 'GET',
            params: {lecture_id: $scope.lectureId}
        })
            .success(function (answer) {

                angular.forEach(answer.messages, function (msg) {
                    $scope.msg = $scope.msg + msg.sender + " <" + msg.time + ">: " + msg.message + "\n";
                });
                $scope.answers = answer.answers;
                for (var i = 0; i < answer.questions.length; i++) {
                    $scope.dynamicAnswerShowControls.push({});
                    $scope.points.push(0);
                }
                $scope.questions = answer.questions;
                $scope.isLecturer = answer.isLecturer;
                $scope.answerers = answer.answerers;
                $scope.userName = answer.userName;
            })
            .error(function () {
                $window.console.log("fail");
            });
    };

    /*
     Gets the lecture info when loading page.
     */
    $scope.getLectureInfo();

    /**
     * Sends http request to delete the lecture.
     * @memberof module:lectureInfoController
     */
    $scope.deleteLecture = function () {
        var confirmAnswer = $window.confirm("Do you really want to delete this lecture?");
        if (confirmAnswer) {
            $http({
                url: '/deleteLecture',
                method: 'POST',
                params: {'doc_id': $scope.docId, lecture_id: $scope.lectureId}
            })
                .success(function () {
                    window.history.back();
                })
                .error(function () {
                    $window.console.log("Failed to delete the lecture");
                });
        }
    };

    /**
     * Draws charts from the answer of the current lecture.
     * @param userName Which users answers to shows. If undefined shows from every user.
     * @memberof module:lectureInfoController
     */
    $scope.drawCharts = function (userName) {
        for (var p = 0; p < $scope.points.length; p++) {
            $scope.points[p] = 0;
        }
        $scope.showPoints = true;
        var user;
        if (typeof userName === 'undefined') {
            user = "";
        } else {
            user = userName;
        }
        var questionIndexes = [];
        for (var i = 0; i < $scope.dynamicAnswerShowControls.length; i++) {
            $scope.dynamicAnswerShowControls[i].createChart(JSON.parse($scope.questions[i].questionJson));
            questionIndexes.push($scope.questions[i].question_id);
        }

        for (var j = 0; j < $scope.answers.length; j++) {
            if (($scope.isLecturer && user === "") || $scope.answers[j].user_name === user) {
                $scope.dynamicAnswerShowControls[questionIndexes.indexOf($scope.answers[j].question_id)]
                    .addAnswer([{"answer": $scope.answers[j].answer}]);
                $scope.points[questionIndexes.indexOf($scope.answers[j].question_id)] += $scope.answers[j].points;
            }

        }


        if ($scope.answers.length <= 0) {
            var elem = $("#infoBox");
            elem.empty();
            elem.append("No answers from this lecture");
        }
    };
}]);