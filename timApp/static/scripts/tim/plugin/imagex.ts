import angular from "angular";
import ngSanitize from "angular-sanitize";
import {editorChangeValue} from "../editor/editorScope";
import * as timHelper from "../util/timHelper";
import {markAsUsed} from "../util/utils";
import {$window} from "../util/ngimport";

markAsUsed(ngSanitize);

const imagexApp: any = angular.module("imagexApp", ["ngSanitize"]);
imagexApp.TESTWITHOUTPLUGINS = false; // if one wants to test without imagex plugins

declare const videoApp: any;
declare const teacherMode: boolean;

imagexApp.directive("imagexRunner",
    ["$sanitize", "$compile",
        function($sanitize, $compile1) {
            "use strict";
            // Tata kutsutaan yhden kerran kun plugin otetaan kayttoon
            imagexApp.sanitize = $sanitize;
            imagexApp.compile = $compile1;
            return imagexApp.directiveFunction();
        }],
);

let globalPreviewColor = "#fff";

imagexApp.directiveFunction = function() {
    "use strict";
    // Koska tata kutsutaan direktiivista, tata kutsutaan yhden kerran
    return {
        scope: {},
        controller: ["$scope", "$http", "$transclude", "$sce", "$interval", imagexApp.Controller],
        link: imagexApp.initScope,
        restrict: "AE",
        /*
         compile: function(tElement, attrs) {
         var content = tElement.children();
         },
         */
        transclude: true,
        replace: "true",
        template: imagexApp.directiveTemplate(),
        // templateUrl: 'html/paliTempl.html'
    };
};

function FreeHand(scope) {
    this.params = {};
    this.params.w = 2;
    this.params.color = "Red";
    this.params.lineMode = false; // freeHand mode, true would be line mode
    this.prevPos = null;
    this.freeDrawing = [];
    this.redraw = null;
    this.emotion = scope.emotion;
    this.scope = scope;
    this.videoPlayer = {currentTime: 1e60, fakeVideo: true};  // fake
}

FreeHand.prototype.draw = function(ctx) {
    if (this.emotion) {
        if (teacherMode)
            if (this.videoPlayer.fakeVideo)
                drawCirclesVideo(ctx, this.freeDrawing, this.videoPlayer);
            else if ( this.scope.analyzeDot )
                //Siirrä johonkin missä kutsutaan vain kerran.
                this.videoPlayer.ontimeupdate = drawCirclesVideoDot.bind(this, ctx, this.freeDrawing, this.videoPlayer);
            else
                //Siirrä johonkin missä kutsutaan vain kerran.
                this.videoPlayer.ontimeupdate = drawCirclesVideo.bind(this, ctx, this.freeDrawing, this.videoPlayer);
    }
    else drawFreeHand(ctx, this.freeDrawing);
};

FreeHand.prototype.startSegment = function(pxy) {
    if (!pxy) return;
    const p = [Math.round(pxy.x), Math.round(pxy.y)];
    const ns: any = {};
    if (!this.emotion) {
        ns.color = this.params.color;
        ns.w = this.params.w;
    }
    ns.lines = [p];
    this.freeDrawing.push(ns);
    this.prevPos = p;
};

FreeHand.prototype.endSegment = function() {
    this.drawingSurfaceImageData = null;
};

FreeHand.prototype.startSegmentDraw = function(redraw, pxy) {
    if (!pxy) return;
    let p;
    if (this.emotion) {
        if (this.freeDrawing.length != 0) return;
        p = [Math.round(pxy.x), Math.round(pxy.y),
        Date.now() / 1000, this.videoPlayer.currentTime];
    } else p = [Math.round(pxy.x), Math.round(pxy.y)];
    this.redraw = redraw;
    const ns: any = {};
    if (!this.emotion) {
        ns.color = this.params.color;
        ns.w = this.params.w;
    }
    ns.lines = [p];
    this.freeDrawing.push(ns);
    this.prevPos = p;
};

FreeHand.prototype.addPoint = function(pxy) {
    if (!pxy) return;
    this.scope;
    //if (!this.params.startTime) var startTime = 0;
    //else var startTime = this.params.startTime;
    //var ns = {};

    let p;
    if (this.emotion) {
        p = [Math.round(pxy.x), Math.round(pxy.y),
        Date.now() / 1000, this.videoPlayer.currentTime];
    } else p = [Math.round(pxy.x), Math.round(pxy.y)];
    const n = this.freeDrawing.length;
    if (n == 0) this.startSegment(p);
    else {
        const ns = this.freeDrawing[n - 1];
        //    ns.lines = [p];
        ns.lines.push(p);
    }
    if (!this.params.lineMode || this.emotion)
        this.prevPos = p;
};

FreeHand.prototype.popPoint = function(minlen) {
    const n = this.freeDrawing.length;
    if (n == 0) return;
    const ns = this.freeDrawing[n - 1];
    if (ns.lines.length > minlen) ns.lines.pop();
};

FreeHand.prototype.popSegment = function(minlen) {
    const n = this.freeDrawing.length;
    if (n <= minlen) return;
    this.freeDrawing.pop();
    if (this.redraw) this.redraw();
};

FreeHand.prototype.addPointDraw = function(ctx, pxy) {
    if (!pxy) return;
    if (this.params.lineMode) {
        this.popPoint(1);
        if (this.redraw) this.redraw();
    }
    if (!this.emotion)
        this.line(ctx, this.prevPos, [pxy.x, pxy.y]);
    this.addPoint(pxy);
};

FreeHand.prototype.clear = function() {
    this.freeDrawing = [];
    if (this.redraw) this.redraw();
};

FreeHand.prototype.setColor = function(newColor) {
    this.params.color = newColor;
    if (this.update) this.update();
    this.startSegment(this.prevPos);
};

FreeHand.prototype.setWidth = function(newWidth) {
    this.params.w = newWidth;
    if (this.params.w < 1) this.params.w = 1;
    if (this.update) this.update();
    this.startSegment(this.prevPos);
};

FreeHand.prototype.incWidth = function(dw) {
    this.setWidth(parseInt(this.params.w) + dw);
};

FreeHand.prototype.setLineMode = function(newMode) {
    this.params.lineMode = newMode;
    if (this.update) this.update();
};

FreeHand.prototype.flipLineMode = function(newMode) {
    this.setLineMode(!this.params.lineMode);
};

FreeHand.prototype.line = function(ctx, p1, p2) {
    if (!p1 || !p2) return;
    ctx.beginPath();
    ctx.strokeStyle = this.params.color;
    ctx.lineWidth = this.params.w;
    ctx.moveTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.stroke();
};

function pad(num, size) {
    var s = "000000000" + num;
    return s.substr(s.length-size);
}

function dateToString(d,h) {
    const t = new Date(d * 1000);
    //return t.toLocaleTimeString('fi-FI');
    //return t.format("HH:mm:ss.f");
    var hs = "";
    if ( h ) hs =  pad(t.getHours(),2) + ":";
    return hs + pad(t.getMinutes(),2) + ":" + pad(t.getSeconds(),2) + "." + pad(t.getMilliseconds(),3);
}

function drawText(ctx, s, x, y, font = "10px Arial") {
    ctx.save();
    ctx.textBaseline = "top";
    ctx.font = font;
    const width = ctx.measureText(s).width;
    ctx.fillStyle = "#ffff00";
    ctx.fillRect(x, y, width + 1, parseInt(ctx.font, 10));
    ctx.fillStyle = "#000000";
    ctx.fillText(s, x, y);
    ctx.restore();
}

function showTime(ctx, vt, x, y, font) {
    ctx.beginPath();
    const s = dateToString(vt, false);
    drawText(ctx, s, x, y, font);
    ctx.stroke();
}


function drawCirclesVideoDot(ctx, dr, videoPlayer) {
    for (let dri = 0; dri < dr.length; dri++) {
        const seg = dr[dri];
        var vt =  videoPlayer.currentTime;
        // console.log("vt: " + vt + " " + this.scope.lastDrawnSeg );
        var seg1 = -1;
        var seg2 = 0;
        var s = "";
        for (let lni = 0; lni < seg.lines.length; lni++) {
            if (vt < seg.lines[lni][3])
                break;
            seg1 = seg2;
            seg2 = lni;
        }


        // console.log("" + seg1 + "-" + seg2 + ": " + seg.lines[seg2][3]);
        var drawDone = false;
        if ( this.scope.dotVisibleTime && this.scope.lastVT && (vt - this.scope.lastVT) > this.scope.dotVisibleTime ) { // remove old dot if needed
            this.scope.draw();
            drawDone = true
        }
        if ( this.scope.showVideoTime ) showTime(ctx, vt, 0, 0, "13px Arial");
        if ( this.scope.lastDrawnSeg == seg2  ) return;
        this.scope.lastDrawnSeg = -1;
        if ( !drawDone ) this.scope.draw();
        if ( this.scope.showVideoTime ) showTime(ctx, vt, 0, 0, "13px Arial");
        if ( seg1 < 0 || vt == 0 || seg.lines[seg2][3] == 0) return;

        // console.log("" + seg1 + "-" + seg2 + ": " + seg.lines[seg2][3]);


        ctx.beginPath();
        this.scope.lastVT = vt;
        ctx.strokeStyle = seg.color;
        ctx.lineWidth = seg.w;
        ctx.moveTo(seg.lines[seg1][0], seg.lines[seg1][1]);
        if ( this.scope.drawLast )
            ctx.lineTo(seg.lines[seg2][0], seg.lines[seg2][1]);
        ctx.stroke();
        this.scope.drawFillCircle(ctx, 30, seg.lines[seg2][0], seg.lines[seg2][1], "black", 0.5);
        if ( this.scope.showTimes ) {
            s = dateToString(seg.lines[seg2][3], false);
            drawText(ctx, s, seg.lines[seg2][0], seg.lines[seg2][1], "13px Arial");
        }

        this.scope.lastDrawnSeg = seg2;
    }
}


function drawCirclesVideo(ctx, dr, videoPlayer) {
    if ( !videoPlayer.fakeVideo ) this.scope.draw();
    const vt = videoPlayer.currentTime;
    for (let dri = 0; dri < dr.length; dri++) {
        const seg = dr[dri];
        if (seg.lines.length < 1) continue;
        var s = "";
        ctx.beginPath();
        ctx.strokeStyle = seg.color;
        ctx.lineWidth = seg.w;
        ctx.moveTo(seg.lines[0][0], seg.lines[0][1]);
        if (videoPlayer.fakeVideo) {
            s = dateToString(seg.lines[0][2], true);
            drawText(ctx, s, seg.lines[0][0], seg.lines[0][1]);
        } else {
            if (vt >= seg.lines[0][3])
                this.scope.drawFillCircle(ctx, 5, seg.lines[0][0], seg.lines[0][1], "black", 0.5);
        }
        for (let lni = 1; lni < seg.lines.length; lni++) {
            if (vt < seg.lines[lni][3])
                break;
            ctx.lineTo(seg.lines[lni][0], seg.lines[lni][1]);
            if (videoPlayer.fakeVideo) {
                s = dateToString(seg.lines[lni][2],true);
                drawText(ctx, s, seg.lines[lni][0], seg.lines[lni][1]);
            }
        }
        ctx.stroke();
    }
}

function drawFreeHand(ctx, dr) {
    for (let dri = 0; dri < dr.length; dri++) {
        const seg = dr[dri];
        if (seg.lines.length < 2) continue;
        ctx.beginPath();
        ctx.strokeStyle = seg.color;
        ctx.lineWidth = seg.w;
        ctx.moveTo(seg.lines[0][0], seg.lines[0][1]);
        for (let lni = 1; lni < seg.lines.length; lni++) {
            ctx.lineTo(seg.lines[lni][0], seg.lines[lni][1]);
        }
        ctx.stroke();
    }
}

imagexApp.directiveTemplate = function() {
    "use strict";
    // Koska tata kutsutaan directiveFunction-metodista, tata kutsutaan yhden kerran

    if (imagexApp.TESTWITHOUTPLUGINS) return "";
    return '<div class="csRunDiv no-popup-menu">' +
        "<p>Header comes here</p>" +
        '<p ng-if="stem" class="stem" ng-bind-html="stem"></p>' +
        "<div>" +
        '<canvas id="canvas" tabindex="1" width={{canvaswidth}} height={{canvasheight}} no-popup-menu ></canvas>' +
        '<div class="content">' +
        "</div>" +
        "</div>" +
        '<p class="csRunMenu">&nbsp;<button ng-if="button" class="timButton" ng-disabled="isRunning" ng-click="imagexScope.save();">{{button}}</button>&nbsp&nbsp' +
        '<button ng-if="buttonPlay" ng-disabled="isRunning" ng-click="imagexScope.videoPlay();">{{buttonPlay}}</button>&nbsp&nbsp' +
        '<button ng-if="buttonRevert" ng-disabled="isRunning" ng-click="imagexScope.videoBeginning();">{{buttonRevert}}</button>&nbsp&nbsp' +
        '<button ng-show="finalanswer && userHasAnswered" ng-disabled="isRunning" ng-click="imagexScope.showAnswer();">Showanswer</button>&nbsp&nbsp' +
        '<a ng-if="button" ng-disabled="isRunning" ng-click="imagexScope.resetExercise();">{{resetText}}</a>&nbsp&nbsp' +
        '<a href="" ng-if="muokattu" ng-click="imagexScope.initCode()">{{resetText}}</a>' +

        '<label ng-show="freeHandVisible">FreeHand <input type="checkbox" name="freeHand" value="true" ng-model="freeHand"></label> ' +
        "<span>" +
        '<span ng-show="freeHand">' +
        '<label ng-show="freeHandLineVisible">Line <input type="checkbox" name="freeHandLine" value="true" ng-model="lineMode"></label> ' +
        '<span ng-show="freeHandToolbar">' +
        '<input ng-show="true" id="freeWidth" size="1"  style="width: 1.7em" ng-model="w" /> ' +
        '<input colorpicker="hex" id="freeHandColor" type="text" ng-style="{\'background-color\': color}" ng-model="color" size="4"  />&nbsp; ' +
        '<span style="background-color: red; display: table-cell; text-align: center; width: 30px;" ng-click="imagexScope.setFColor(\'#f00\');">R</span>' +
        '<span style="background-color: blue; display: table-cell; text-align: center; width: 30px;" ng-click="imagexScope.setFColor(\'#00f\');">B</span>' +
        '<span style="background-color: yellow; display: table-cell; text-align: center; width: 30px;" ng-click="imagexScope.setFColor(\'#ff0\');">Y</span>' +
        '<span style="background-color: #0f0; display: table-cell; text-align: center; width: 30px;" ng-click="imagexScope.setFColor(\'#0f0\');">G</span>' +
        "&nbsp;" +
        '<a href="" ng-click="imagexScope.undo()">Undo</a>' +
        "</span>" +
        "</span>" +
        "</span>" +
        "</p>" +
        '<div ng-show="preview" >' +
        "<span>" +
        '<span ng-style="{\'background-color\': previewColor}" style="display: table-cell; text-align: center; width: 30px;" ng-click="imagexScope.getPColor();">&lt;-</span> ' +
        '<input ng-model="previewColor" colorpicker="hex" type="text"  ng-model="previewColor" id="previewColorInput" ng-click="imagexScope.getPColor();" size="10"/> ' +
        '<label> Coord: <input  id="coords" ng-click="imagexScope.getPColor();" size="10"/></label>' +
        "</span>" +
        "</div>" +
        '<span class="tries" ng-if="max_tries"> Tries: {{tries}}/{{max_tries}}</span>' +
        '<pre class="" ng-if="error && preview">{{error}}</pre>' +
        '<pre class="" ng-show="result">{{result}}</pre>' +
        '<div  class="replyHTML" ng-if="replyHTML" ><span ng-bind-html="imagexScope.svgImageSnippet()"></span></div>' +
        '<img ng-if="replyImage" class="grconsole" ng-src="{{replyImage}}" alt=""  />' +

        '<p class="plgfooter">Here comes footer</p>' +
        "</div>";
};

imagexApp.initDrawing = function(scope, canvas) {

    //  piirtää ympyrän
    //  ctx on joko canvas tai ctx
    function drawFillCircle(ctx, r, p1, p2, c, tr) {
        if (!p1 || !p2) return;
        var p = ctx;
        if ( p. getContext ) p = ctx.getContext("2d");
        p.globalAlpha = tr;
        p.beginPath();
        p.fillStyle = c;
        p.arc(p1, p2, r, 0, 2 * Math.PI);
        p.fill();
        p.globalAlpha = 1;
    }

    function toRange(range, p) {
        if (!range) return p;
        if (p.length < 2) return p;
        if (p < range[0]) return range[0];
        if (p > range[1]) return range[1];
        return p;
    }

    function getPos(canvas, p) {
        const rect = canvas.getBoundingClientRect();
        const posX = p.clientX;
        const posY = p.clientY;
        return {
            x: posX - rect.left,
            y: posY - rect.top,
        };
    }

    function isObjectOnTopOf(position, object, name, grabOffset) {
        if (!position)
            return false;
        if (!object)
            return false;
        const sina = Math.sin(-object.a * to_radians);
        const cosa = Math.cos(-object.a * to_radians);
        const rotatedX = cosa * (position.x - object.x) - sina * (position.y - object.y);
        const rotatedY = cosa * (position.y - object.y) + sina * (position.x - object.x);

        if (object.name === "target") {
            if (object.type === "rectangle") {
                if (rotatedX >= -object.r1 / 2 && rotatedX <= object.r1 / 2 &&
                    rotatedY >= -object.r2 / 2 && rotatedY <= object.r2 / 2) {
                    if (name && object.name === name) return true;
                    else if (!name) return true;
                }
            }

            else if (object.type === "ellipse") {
                if ((Math.pow(rotatedX, 2) / Math.pow(object.r1 / 2, 2)) +
                    (Math.pow(rotatedY, 2) / Math.pow(object.r2 / 2, 2)) <= 1) {
                    if (name && object.name === name) return true;
                    else if (!name) return true;
                }
            }
        }
        else if (object.name === "dragobject") {
            if (object.type === "img" || object.type === "textbox") {
                if (rotatedX >= - object.pinPosition.off.x - object.pinPosition.x &&
                    rotatedX <= object.r1 - object.pinPosition.off.x - object.pinPosition.x &&
                    rotatedY >= - object.pinPosition.off.y - object.pinPosition.y &&
                    rotatedY <= object.r2 - object.pinPosition.off.y - object.pinPosition.y
                    + grabOffset) {
                    if (name && object.name === name) return true;
                    else if (!name) return true;
                }
            }
            if (object.type === "vector") {
                if (rotatedX >= - object.pinPosition.off.x - object.pinPosition.x &&
                    rotatedX <= object.r1 - object.pinPosition.off.x - object.pinPosition.x &&
                    rotatedY >= -object.r2 / 2 - object.arrowHeadWidth / 2
                    - object.pinPosition.off.y - object.pinPosition.y &&
                    rotatedY <= object.r2 / 2 + object.arrowHeadWidth / 2
                    - object.pinPosition.off.y - object.pinPosition.y + grabOffset) {
                    if (name && object.name === name) return true;
                    else if (!name) return true;
                }
            }
        }
    }

    function areObjectsOnTopOf(position, objects, name) {
        for (let i = objects.length - 1; i >= 0; i--) {
            const collision = isObjectOnTopOf(position, objects[i], name, 0);
            if (collision) {
                return objects[i];
            }
        }
        if (grabOffset) {
            for (let i = objects.length - 1; i >= 0; i--) {
                const collision = isObjectOnTopOf(position, objects[i], name, grabOffset);
                if (collision && objects[i].name === "dragobject") {
                    return objects[i];
                }
            }
        }
        return null;
    }

    function DragTask(canvas) {
        const th = this;
        this.canvas = canvas;
        this.drawObjects = [];
        this.activeDragObject = null;
        this.mousePosition = {x: 0, y: 0};
        scope.drawFillCircle = drawFillCircle;
        this.freeHand = scope.freeHandDrawing;
        let topmostIndex;
        let topmostElement;
        this.draw = function() {
            this.ctx = canvas.getContext("2d");
            this.ctx.fillStyle = getValue1(scope.background, "color", "white");
            this.ctx.fillRect(0, 0, canvas.width, canvas.height);

            scope.incompleteImages = 0;

            for (let i = 0; i < this.drawObjects.length; i++) {
                try {
                    this.drawObjects[i].ctx = this.ctx;
                    if (this.activeDragObject) {
                        const dobj = this.activeDragObject;
                        let p;
                        if (dobj.lock != "x")
                            dobj.x = toRange(dobj.xlimits, this.mousePosition.x - dobj.xoffset);
                        if (dobj.lock != "y")
                            dobj.y = toRange(dobj.ylimits, this.mousePosition.y - dobj.yoffset);
                        if (this.drawObjects[i] == dobj) {
                            topmostIndex = i;
                            topmostElement = this.drawObjects[i];
                        }
                    }
                    if (this.activeDragObject != this.drawObjects[i]) {
                        // kutsutaan objektin omaa piirtoa
                        this.drawObjects[i].draw(this.drawObjects[i]);
                    }
                    if (this.drawObjects[i].name == "dragobject") {
                        if (this.activeDragObject) {
                            const onTopOf = areObjectsOnTopOf(this.activeDragObject,
                                this.drawObjects, "target");
                            if (onTopOf && onTopOf.objectCount < onTopOf.maxObjects) {
                                onTopOf.color = onTopOf.snapColor;
                            }
                            const onTopOfB = areObjectsOnTopOf(this.drawObjects[i],
                                this.drawObjects, "target");
                            if (onTopOfB && this.drawObjects[i] !== this.activeDragObject)
                                onTopOfB.color = onTopOfB.dropColor;
                        }
                        else {
                            const onTopOfA = areObjectsOnTopOf(this.drawObjects[i],
                                this.drawObjects, "target");
                            if (onTopOfA) {
                                onTopOfA.color = onTopOfA.dropColor;
                                //onTopOfA.objectCount++;
                            }
                        }
                    }

                    else if (this.drawObjects[i].name === "target") {
                        this.drawObjects[i].color = this.drawObjects[i].origColor;

                    }
                    //$log.info(onTopOf);
                }

                catch (err) {
                    scope.error += "draw " + this.drawObjects[i].id + ": " + err + "\n";
                }
            }
            this.freeHand.draw(this.ctx);
            if (scope.incompleteImages !== 0) {
                setTimeout(this.draw, 500);
                // tee tahan rajoitus
            }
            if (this.activeDragObject) this.activeDragObject.draw(this.activeDragObject);
        }.bind(this);

        this.interval = setTimeout(this.draw, 20);
        scope.draw = this.draw;

        let mouseDown = false;

        this.canvas.style.touchAction = "double-tap-zoom"; // To get IE and EDGE touch to work

        //if () this.freeHand.startSegmentDraw(this.redraw, this.mousePosition);

        this.downEvent = function(event, p) {
            this.mousePosition = getPos(this.canvas, p);
            this.activeDragObject =
                areObjectsOnTopOf(this.mousePosition, this.drawObjects, "dragobject");

            if (scope.emotion) {
                drawFillCircle(this.canvas, 30, this.mousePosition.x, this.mousePosition.y, "black", 0.5);
                this.freeHand.startSegmentDraw(this.canvas, this.mousePosition);
                this.freeHand.addPointDraw(this.canvas, this.mousePosition);
                if ( scope.autosave ) scope.imagexScope.save();
            }

            if (this.activeDragObject) {
                this.canvas.style.cursor = "pointer";
                this.activeDragObject.xoffset = this.mousePosition.x - this.activeDragObject.x;
                this.activeDragObject.yoffset = this.mousePosition.y - this.activeDragObject.y;
                // event.preventDefault();
                this.draw();
            }
            else if (scope.freeHand) {
                this.canvas.style.cursor = "pointer";
                mouseDown = true;
                //this.freeHand.lineMode = scope.lineMode;

                //drawFillCircle(this.canvas,50,this.mousePosition.x, this.mousePosition.y, "red", 0.3);
                if (!scope.emotion) this.freeHand.startSegmentDraw(this.redraw, this.mousePosition);
            }

            if (this.canvas.coords && scope.preview) {
                this.canvas.coords.value =
                    "[" + Math.round(this.mousePosition.x) + ", "
                    + Math.round(this.mousePosition.y) + "]";
                //scope.coords.select();
                //document.execCommand('copy');
                if (typeof (editorChangeValue) !== "undefined")
                    editorChangeValue(["position:"], this.canvas.coords.value);
            }

        };

        this.redraw = function() {
            th.draw();
        };
        this.freeHand.redraw = this.redraw;

        this.moveEvent = function(event, p) {
            if (this.activeDragObject) {
                // if (this.activeDragObject)
                if (event != p) event.preventDefault();
                this.mousePosition = getPos(this.canvas, p);
                if (!scope.emotion) this.draw();
            } else if (mouseDown) {
                if (event != p) event.preventDefault();
                if (!scope.emotion) this.freeHand.addPointDraw(this.ctx, getPos(this.canvas, p));
            }
        };

        this.upEvent = function(event, p) {

            if (this.activeDragObject) {
                this.canvas.style.cursor = "default";
                if (event != p) event.preventDefault();
                this.mousePosition = getPos(this.canvas, p);

                const isTarget = areObjectsOnTopOf(this.activeDragObject,
                    this.drawObjects, "target");
                this.drawObjects.splice(topmostIndex, 1);
                this.drawObjects.splice(this.drawObjects.length, 0, topmostElement);

                if (isTarget) {
                    if (isTarget.objectCount < isTarget.maxObjects) {
                        if (isTarget.snap) {
                            this.activeDragObject.x = isTarget.x + isTarget.snapOffset[0];
                            this.activeDragObject.y = isTarget.y + isTarget.snapOffset[1];
                        }
                    }
                }

                this.activeDragObject = null;
                if (!scope.emotion) this.draw();

            } else if (mouseDown) {
                this.canvas.style.cursor = "default";
                mouseDown = false;
                this.freeHand.endSegment();
            }
            setTimeout(this.draw, 1000);
            if (!scope.emotion) this.draw(); // TODO: Miksi tama on taalla?
        };

        function te(event) {
            return event.touches[0] || event.changedTouches[0];
        }

        this.canvas.style.msTouchAction = "none";
        this.canvas.addEventListener("mousemove", function(event) {th.moveEvent(event, event);});
        this.canvas.addEventListener("touchmove", function(event) {th.moveEvent(event, te(event));});
        this.canvas.addEventListener("mousedown", function(event) {th.downEvent(event, event);});
        this.canvas.addEventListener("touchstart", function(event) {th.downEvent(event, te(event));});
        this.canvas.addEventListener("mouseup", function(event) {th.upEvent(event, event);});
        this.canvas.addEventListener("touchend", function(event) {th.upEvent(event, te(event));});

        if (scope.freeHandShortCuts)
            // this.canvas.parentElement.parentElement.addEventListener( "keypress", function(event) {
            /*
            this.canvas.addEventListener("keydown", function(event) {
                const c = String.fromCharCode(event.keyCode);

            });
            */
            this.canvas.addEventListener("keypress", function(event) {
                const c = String.fromCharCode(event.keyCode);
                if (event.keyCode == 26) {th.freeHand.popSegment(0);}
                if (c == "c") {th.freeHand.clear(); th.draw();}
                if (c == "r") th.freeHand.setColor("#f00");
                if (c == "b") th.freeHand.setColor("#00f");
                if (c == "y") th.freeHand.setColor("#ff0");
                if (c == "g") th.freeHand.setColor("#0f0");
                if (c == "+") th.freeHand.incWidth(+1);
                if (c == "-") th.freeHand.incWidth(-1);
                if (c == "1") th.freeHand.setWidth(1);
                if (c == "2") th.freeHand.setWidth(2);
                if (c == "3") th.freeHand.setWidth(3);
                if (c == "4") th.freeHand.setWidth(4);
                if (c == "l") th.freeHand.flipLineMode();
                if (c == "f" && scope.freeHandShortCut) {scope.freeHand = !scope.freeHand; scope.$apply();}
            }, false);

        // Lisatty eventlistenereiden poistamiseen.
        /*
        this.removeEventListeners = function() {
            this.canvas.removeEventListener('mousemove', moveEvent);
            this.canvas.removeEventListener('touchmove', moveEvent);
            this.canvas.removeEventListener('mousedown', downEvent);
            this.canvas.removeEventListener('touchstart', downEvent);
            this.canvas.removeEventListener('mouseup', upEvent);
            this.canvas.removeEventListener('touchend', upEvent);
        }
        */

        this.addRightAnswers = function() {
            // have to add handler for drawing finalanswer here. no way around it.
            if (scope.rightAnswersSet) {dt.draw(); return;}
            if (!scope.answer || !scope.answer.rightanswers) return;

            const rightdrags = scope.answer.rightanswers;
            const dragtable = scope.objects;
            let j = 0;
            for (j = 0; j < rightdrags.length; j++) {
                let p = 0;
                for (p = 0; p < objects.length; p++) {
                    if (objects[p].id === rightdrags[j].id) {
                        let values: any = {beg: objects[p], end: rightdrags[j]};
                        rightdrags[j].x = rightdrags[j].position[0];
                        rightdrags[j].y = rightdrags[j].position[1];
                        const line = new Line(dt, values);
                        line.did = "-";
                        this.drawObjects.push(line);
                        //line.draw();
                        values = {};
                    }
                }
            }
            scope.rightAnswersSet = true;

            dt.draw();
        };

    }

    function Empty(objectValues) {}

    function DragObject(dt, values, defId) {
        this.did = defId;
        this.id = getValue(values.id, defId);
        values.id = this.id;

        this.draw = Empty;
        this.draggableObject = {};
        this.draggablePin = getValueDef(values, "pin.draggable", false);
        if (this.draggablePin) {
            this.type = "pin";
            this.draggableObject.type = getValueDef(values, "type", "textbox", true);
        }
        else
            this.type = getValueDef(values, "type", "textbox", true);
        this.name = "dragobject";
        this.ctx = dt.ctx;
        if (values.state === "state") {
            this.position = values.position;
            this.x = this.position[0] - values.pinpointoffsetx;
            this.y = this.position[1] - values.pinpointoffsety;
        }
        else {
            this.position = getValueDef(values, "position", [0, 0]);
            this.x = this.position[0];
            this.y = this.position[1];
        }
        this.draggableObject.x = this.x;
        this.draggableObject.y = this.y;

        this.origPos = {};
        this.origPos.x = this.x;
        this.origPos.y = this.y;
        this.origPos.pos = this.position;
        this.lock = getValueDef(values, "lock", "");
        this.xlimits = getValueDef(values, "xlimits", null);
        this.ylimits = getValueDef(values, "ylimits", null);

        // If default values of type, size, a or position are changed, check also imagex.py
        if (this.type === "vector") this.size = getValueDef(values, "size", [50, 4]);
        else this.size = getValueDef(values, "size", [10, 10]);
        this.r1 = getValue(this.size[0], 10);
        this.r2 = getValue(this.size[1], this.r1);
        this.target = null;
        this.currentTarget = null;
        this.ispin = isKeyDef(values, "pin", false);
        this.a = -getValueDef(values, "a", 0);
        this.imgproperties = {};
        this.textboxproperties = {};
        this.vectorproperties = {};

        this.init = shapeFunctions[this.type].init;
        this.pinInit = shapeFunctions.pin.init;
        this.pinInit2 = shapeFunctions.pin.init2;
        this.textbox = {};
        this.textbox.init = shapeFunctions.textbox.init;
        this.textbox.init(values);

        if (this.type === "vector" || this.draggableObject.type === "vector") {
            this.vectorInit = shapeFunctions.vector.init;
            this.vectorInit(values);
            this.vectorDraw = shapeFunctions.vector.draw;
        }

        if (this.type === "img" || this.draggableObject.type === "img") {
            this.init2 = shapeFunctions.img.init2;
            this.imageDraw = shapeFunctions.img.draw;
        }

        this.pinInit(values);
        // this.pinDraw = shapeFunctions['pin'].draw;
        this.textbox.draw = shapeFunctions.textbox.draw;

        this.init(values);
        this.draw = shapeFunctions.pin.draw;
        // this.draw = shapeFunctions[this.type].draw;
    }

    function Target(dt, values, defId) {
        this.did = defId;
        this.id = getValue(values.id, defId);
        values.id = this.id;
        this.name = "target";
        this.ctx = dt.ctx;
        this.maxObjects = getValue(values.maxObjects, 1000);
        this.objectCount = 0;
        // If default values of type, size, a or position are changed, check also imagex.py
        this.position = getValueDef(values, "position", [0, 0]);
        this.x = this.position[0];
        this.y = this.position[1];
        this.a = -getValueDef(values, "a", 0);
        this.snap = getValueDef(values, "snap", true);
        this.snapOffset = getValueDef(values, "snapOffset", [0, 0]);
        this.type = getValueDef(values, "type", "rectangle", true);
        this.size = getValueDef(values, "size", [10, 10]);
        this.imgproperties = {};
        this.textboxproperties = {};
        this.vectorproperties = {};
        this.r1 = getValue(this.size[0], 10);
        this.r2 = getValue(this.size[1], this.r1);
        this.color = getValueDef(values, "color", "Blue");
        this.origColor = getValueDef(values, "color", "Blue");
        this.snapColor = getValueDef(values, "snapColor", "Cyan");
        this.dropColor = getValueDef(values, "dropColor", this.snapColor);
        this.init = shapeFunctions[this.type].init;
        this.init(values);
        //this.textboxInit = shapeFunctions['textbox'].init;
        //this.textBoxDraw = shapeFunctions['textbox'].draw;
        this.draw = shapeFunctions[this.type].draw;

    }

    function FixedObject(dt, values, defId?) {
        this.did = defId;
        this.id = getValue(values.id, defId);
        values.id = this.id;
        if (values.name === "background") {
            this.type = "img";
            this.name = "background";
        }
        else {
            this.type = getValueDef(values, "type", "rectangle", true);
            this.name = "fixedobject";
        }
        this.ctx = dt.ctx;
        // If default values of type, size, a or position are changed, check also imagex.py
        this.position = getValueDef(values, "position", [0, 0]);
        this.x = this.position[0];
        this.y = this.position[1];
        this.a = -getValueDef(values, "a", 0);
        this.color = getValueDef(values, "color", "Blue");
        this.size = getValueDef(values, "size", [10, 10]);
        this.r1 = getValue(this.size[0], 10);
        this.r2 = getValue(this.size[1], this.r1);
        this.imgproperties = {};
        this.textboxproperties = {};
        this.vectorproperties = {};

        this.init = shapeFunctions[this.type].init;
        if (this.name === "fixedobject") {
            this.textbox = {};
            this.textbox.init = shapeFunctions.textbox.init;
            this.textbox.init(values);
            this.textbox.draw = shapeFunctions.textbox.draw;
        }
        if (this.type === "img") {
            this.init2 = shapeFunctions.img.init2;
        }
        this.imageDraw = shapeFunctions.img.draw;
        this.vectorDraw = shapeFunctions.vector.draw;

        this.init(values);
        this.draw = shapeFunctions[this.type].draw;
    }

    // Kutsuu viivaa piirtavaa funktiota.
    function Line(dt, values) {
        this.ctx = dt.ctx;
        this.beg = values.beg;
        this.end = values.end;
        this.color = getValueDef(values, "answerproperties.color", "green");
        this.lineWidth = getValueDef(values, "answerproperties.lineWidth", 2);

        this.draw = shapeFunctions.line.draw;
    }

    // Check if key exists in value, previous or defaults
    // if (  isKeyDef(initValues, "pin", false) ...;
    // there is no sence to call this with true because then it always returns true
    function isKeyDef(value, key, defaultValue) {
        const keys = key.split(".");
        let v = value;
        let p = scope.previousValue;
        let d = scope.defaults;
        let ret = defaultValue;
        let k; // current key

        // Loop v and p to same level
        for (let i = 0; i < keys.length - 1; i++) {
            const k = keys[i];
            if (!p[k]) p[k] = {}; // if not on p, add
            p = p[k]; // for next round
            if (v && v[k]) v = v[k]; else v = null;
            if (d && d[k]) d = d[k]; else d = null;
        }

        if (keys.length < 1) return ret;
        k = keys[keys.length - 1];
        if (v && (typeof v[k] !== "undefined")) {
            if (v[k] != null) ret = true;
            p["iskey" + k] = ret;
            return ret;
        }
        if (p && (typeof p["iskey" + k] !== "undefined")) return p["iskey" + k];
        if (d && (typeof d[k] !== "undefined")) return true;
        return ret;
    }

    // Find value for key from value, prevous or defaults.  If nowhere return defaultValue
    function getValueDef(value, key, defaultValue, keepEmtpyAsNone = false) {
        const keys = key.split(".");
        let v = value;
        let p = scope.previousValue;
        let d = scope.defaults;
        let ret = defaultValue;
        let k; // current key

        // Loop v and p to same level
        for (let i = 0; i < keys.length - 1; i++) {
            const k = keys[i];
            if (!p[k]) p[k] = {}; // if not on p, add
            p = p[k]; // for next round
            if (v && v[k]) v = v[k]; else v = null;
            if (d && d[k]) d = d[k]; else d = null;
        }

        if (keys.length < 1) return ret;
        k = keys[keys.length - 1];
        if (v && (typeof v[k] !== "undefined")) {
            if (v[k] != null && (!keepEmtpyAsNone || v[k] != "")) {
                ret = v[k];
                p[k] = ret;
            }
            else p[k] = null;

            return ret;
        }
        if (p && (typeof p[k] !== "undefined") && p[k] != null) return p[k];
        if (d && (typeof d[k] !== "undefined") && d[k] != null) return d[k];
        return ret;
    }

    function getValue(value, defaultValue) {
        // function getValue(value, key, defaultValue) {
        // scope.default...
        // var keys = key.split["."];
        if (value == null || value == null || value === "" ||
            (value.constructor === Array && value.length == 0))
            return defaultValue;
        else return value;
    }

    function getValue1(value, key, defaultValue) {
        if (value == null || value == null || value === "" ||
            (value.constructor === Array && value.length == 0))
            return defaultValue;
        return getValue(value[key], defaultValue);
    }

    function getValue2(value, key1, key2, defaultValue) {
        if (value == null || value == null || value === "" ||
            (value.constructor === Array && value.length == 0))
            return defaultValue;
        return getValue1(value[key1], key2, defaultValue);
    }

    function isTouchDevice() {
        return typeof window.ontouchstart !== "undefined";
    }

    const isTouch = isTouchDevice();
    let grabOffset: number;
    if (isTouch) grabOffset = scope.extraGrabAreaHeight;
    else grabOffset = 0;

    const to_radians = Math.PI / 180;
    const doc_ctx = canvas;
    const dt = new DragTask(doc_ctx);
    scope.dt = dt;

    //var canvas = element[0];

    const shapeFunctions = {
        //Tama piirtaa viivan, mutta vain kerran.
        line: {
            init(initValues) {},
            draw(objectValues) {
                this.ctx = objectValues.ctx;
                //attribuuteista vari ja leveys seka aseta dash
                this.ctx.beginPath();
                this.ctx.moveTo(this.beg.x, this.beg.y);
                this.ctx.lineTo(this.end.x, this.end.y);
                this.ctx.lineWidth = this.lineWidth;
                this.ctx.strokeStyle = this.color;
                this.ctx.stroke();
            },
        },

        ellipse: {
            init(initValues) {},
            draw(objectValues) {
                this.ctx = objectValues.ctx;
                this.ctx.strokeStyle = this.color;
                this.ctx.lineWidth = 2;
                this.ctx.save();
                this.ctx.beginPath();
                this.ctx.translate(this.x, this.y);
                this.ctx.rotate(this.a * to_radians);
                this.ctx.scale(this.r1 / 2, this.r2 / 2);
                this.ctx.arc(0, 0, 1, 0, 2 * Math.PI, false);
                this.ctx.restore();
                this.ctx.stroke();
            },
        },

        rectangle: {
            init(initValues) {
                this.cornerRadius = getValue(initValues.cornerradius, 0);
                this.borderWidth = getValueDef(initValues, "borderWidth", 2);
                if (this.cornerRadius > this.r1 / 2 || this.cornerRadius > this.r2 / 2) {
                    if (this.cornerRadius > this.r1 / 2) this.cornerRadius = this.r1 / 2;
                    if (this.cornerRadius > this.r2 / 2) this.cornerRadius = this.r2 / 2;
                }
            },
            draw(objectValues) {
                this.ctx = objectValues.ctx;
                this.ctx.strokeStyle = this.color;
                this.ctx.lineWidth = this.borderWidth;
                this.ctx.save();
                this.ctx.translate(this.x, this.y);
                this.ctx.rotate(this.a * to_radians);
                this.ctx.beginPath();
                this.ctx.moveTo(-this.r1 / 2 - 1 + this.cornerRadius, -this.r2 / 2);
                this.ctx.lineTo(this.r1 / 2 - this.cornerRadius, -this.r2 / 2);
                this.ctx.arc(this.r1 / 2 - this.cornerRadius, -this.r2 / 2 + this.cornerRadius,
                    this.cornerRadius, 1.5 * Math.PI, 0);
                this.ctx.lineTo(this.r1 / 2, this.r2 / 2 - this.cornerRadius);
                this.ctx.arc(this.r1 / 2 - this.cornerRadius, this.r2 / 2 - this.cornerRadius,
                    this.cornerRadius, 0, 0.5 * Math.PI);
                this.ctx.lineTo(-this.r1 / 2 + this.cornerRadius, this.r2 / 2);
                this.ctx.arc(-this.r1 / 2 + this.cornerRadius, this.r2 / 2 - this.cornerRadius,
                    this.cornerRadius, 0.5 * Math.PI, Math.PI);
                this.ctx.lineTo(-this.r1 / 2, -this.r2 / 2 + this.cornerRadius);
                this.ctx.arc(-this.r1 / 2 + this.cornerRadius, -this.r2 / 2 +
                    this.cornerRadius, this.cornerRadius, Math.PI, 1.5 * Math.PI);
                this.ctx.restore();
                this.ctx.stroke();
            },
        },

        vector: {
            init(initValues) {
                this.r1 = this.size[0];
                this.r2 = this.size[1];
                this.arrowHeadWidth =
                    getValueDef(initValues, "vectorproperties.arrowheadwidth", this.r2 * 3);
                this.arrowHeadLength =
                    getValueDef(initValues, "vectorproperties.arrowheadlength", this.r2 * 5);
                this.vectorColor = getValueDef(initValues, "vectorproperties.color", "Black");
                this.drawtextbox = getValueDef(initValues, "vectorproperties.textbox", false);
            },
            draw(objectValues) {
                this.ctx = objectValues.ctx;
                this.ctx.strokeStyle = this.vectorColor;
                this.ctx.fillStyle = this.ctx.strokeStyle;
                if (objectValues.pinPosition) {
                    this.vectorX = - objectValues.pinPosition.off.x
                        - objectValues.pinPosition.x;
                    this.vectorY = - objectValues.pinPosition.off.y
                        - objectValues.pinPosition.y;
                }
                else {
                    this.vectorX = getValue(objectValues.position[0], 0);
                    this.vectorY = getValue(objectValues.position[1], 0);
                }
                this.ctx.save();
                if (objectValues.name === "fixedobject") {
                    this.ctx.translate(this.x, this.y);
                    this.ctx.rotate(this.a * to_radians);
                }
                if (objectValues.name === "dragobject") {
                    this.ctx.translate(this.vectorX, this.vectorY);
                }
                this.ctx.beginPath();
                this.ctx.lineTo(0, this.r2);
                this.ctx.lineTo(this.r1 - this.arrowHeadLength, this.r2);
                this.ctx.lineTo(this.r1 - this.arrowHeadLength, this.r2 / 2 +
                    this.arrowHeadWidth / 2);
                this.ctx.lineTo(this.r1, this.r2 / 2);
                this.ctx.lineTo(this.r1 - this.arrowHeadLength,
                    this.r2 / 2 - this.arrowHeadWidth / 2);
                this.ctx.lineTo(this.r1 - this.arrowHeadLength, 0);
                //this.ctx.lineTo(0, - this.r2 );
                this.ctx.lineTo(0, 0);
                this.ctx.fill();
                if (this.drawtextbox) {
                    this.textbox.draw(objectValues);
                }
                this.ctx.restore();
            },
        },

        img: {
            init(initValues) {
                this.ready = false;  // to prevent to use wrong values
                this.image = new Image();
                if (initValues.name === "background") {
                    this.image.src = getValue(initValues.src, "");
                    this.size = getValue(initValues.size, [null, null]);
                    // do not use bg size as a default
                }
                else {
                    this.image.src = getValueDef(initValues, "imgproperties.src", "");
                    this.size = getValueDef(initValues, "size", [null, null]);
                }
                this.initValues = initValues;
                this.imgproperties.textbox = getValueDef(initValues,
                    "imgproperties.textbox", false);
                if (this.imgproperties.textbox) this.textbox.init(initValues);
                if (!this.image.complete) return;
                this.init2();
            },
            init2() {
                const initValues = this.initValues;
                const r1 = getValue(this.image.width, 0);
                let r2 = getValue(this.image.height, 0);
                if (r1 == 0) return;
                // Look if size attribute overrides the image size
                this.r1 = getValue(this.size[0], r1);
                if (this.size[0] && !this.size[1]) r2 = this.r1 / r1 * r2;
                this.r2 = getValue(this.size[1], r2);
                this.size[0] = this.r1;
                this.size[1] = this.r2;
                this.ready = true;
                if (initValues.name === "background") return;
                initValues.r1 = this.r1;
                initValues.r2 = this.r2;
                initValues.x = getValue(initValues.position[0], 0);
                initValues.y = getValue(initValues.position[1], 0);
                if (this.ispin) this.pinInit2();
            },

            draw(objectValues) {
                if (!this.image.complete) {
                    scope.incompleteImages = + 1;
                    return;
                }
                if (!this.ready) this.init2();
                this.ctx = objectValues.ctx;
                if (objectValues.pinPosition) {
                    this.imageX = - objectValues.pinPosition.off.x
                        - objectValues.pinPosition.x;
                    this.imageY = - objectValues.pinPosition.off.y
                        - objectValues.pinPosition.y;
                }
                else {
                    this.imageX = getValue(objectValues.position[0], 0);
                    this.imageY = getValue(objectValues.position[1], 0);
                }
                this.ctx.save();
                this.ctx.translate(this.imageX, this.imageY);
                if (objectValues.name === "fixedobject" || objectValues.name === "background")
                    this.ctx.rotate(this.a * to_radians);
                this.ctx.drawImage(this.image, 0, 0, this.r1, this.r2);
                if (this.imgproperties.textbox) this.textbox.draw(objectValues);
                this.ctx.restore();
            },
        },

        textbox: {
            init(initValues) {

                this.margins = getValueDef(initValues, "textboxproperties.margins", [3]);
                if (typeof this.margins === "number") {
                    this.margin = this.margins;
                    this.margins = [];
                    this.margins.push(this.margin);

                }
                this.topMargin = this.margins[0];
                this.rightMargin = getValue(this.margins[1], this.topMargin);
                this.bottomMargin = getValue(this.margins[2], this.topMargin);
                this.leftMargin = getValue(this.margins[3], this.rightMargin);
                this.draggableObject = {};
                this.type = getValueDef(initValues, "type", "textbox");
                this.draggableObject.type = getValueDef(initValues, "type", null);
                this.textBoxOffset = getValueDef(initValues, "textboxproperties.position", [0, 0]);
                if (this.type === "img" || this.type === "vector") {
                    // this.textBoxOffset = getValueDef(initValues, "textboxproperties.position", [0, 0]);
                    this.x = getValue(this.textBoxOffset[0], 0);
                    this.y = getValue(this.textBoxOffset[1], 0);
                }

                const fontDraw = document.createElement("canvas");
                // TODO: scopessa voisi olla alustuksen aikana yksi dummy canvas
                // joka sitten poistetaan
                this.font = getValueDef(initValues, "textboxproperties.font", "14px Arial");
                const auxctx = fontDraw.getContext("2d");
                auxctx.font = this.font;
                this.text = getValueDef(initValues, "textboxproperties.text", initValues.id);
                if (!this.text) this.text = "";
                this.lines = this.text.split("\n");
                const lineWidths = [];

                // measure widest line
                for (let i = 0; i < this.lines.length; i++) {
                    lineWidths[i] = auxctx.measureText(this.lines[i]).width;
                }
                this.textwidth = Math.max.apply(null, lineWidths);  // Math.max(...lineWidths);
                this.textHeight = parseInt(auxctx.font, 10) * 1.1;
                this.textBoxSize = getValueDef(initValues, "textboxproperties.size", []);
                this.r1 = getValue(this.textBoxSize[0],
                    this.textwidth + this.leftMargin + this.rightMargin);
                this.r2 = getValue(this.textBoxSize[1], (this.textHeight * this.lines.length)
                    + this.topMargin + this.bottomMargin);
                this.borderColor = getValueDef(initValues,
                    "textboxproperties.borderColor", "Black");
                this.fillColor = getValueDef(initValues,
                    "textboxproperties.fillColor", "White");
                this.textColor = getValueDef(initValues,
                    "textboxproperties.textColor", "Black");
                this.borderWidth = getValueDef(initValues, "textboxproperties.borderWidth", 2);
                this.cornerRadius = getValueDef(initValues,
                    "textboxproperties.cornerradius", 0);
                if (this.cornerRadius > this.r1 / 2 || this.cornerRadius > this.r2 / 2) {
                    if (this.cornerRadius > this.r1 / 2) this.cornerRadius = this.r1 / 2;
                    if (this.cornerRadius > this.r2 / 2) this.cornerRadius = this.r2 / 2;
                }
                initValues.r1 = this.r1;
                initValues.r2 = this.r2;
                initValues.x = this.x;
                initValues.y = this.y;
                if (this.ispin) {
                    this.pinInit(initValues);
                }
            },

            draw(objectValues) {
                this.ctx = objectValues.ctx;
                this.ctx.font = getValue(this.font, "14px Arial");
                this.ctx.textBaseline = "top";
                if (objectValues.type === "textbox" && objectValues.name === "dragobject") {
                    this.textBoxX = - objectValues.pinPosition.off.x
                        - objectValues.pinPosition.x;
                    this.textBoxY = - objectValues.pinPosition.off.y
                        - objectValues.pinPosition.y;
                }
                else if (objectValues.name === "fixedobject" && objectValues.type === "textbox") {
                    this.textBoxX = objectValues.x;
                    this.textBoxY = objectValues.y;
                }
                else {
                    this.textBoxX = objectValues.textbox.textBoxOffset[0];
                    this.textBoxY = objectValues.textbox.textBoxOffset[1];
                }
                this.ctx.save();
                this.ctx.translate(this.textBoxX, this.textBoxY);
                if (objectValues.name === "fixedobject") this.ctx.rotate(this.a * to_radians);
                this.ctx.beginPath();
                this.ctx.moveTo(this.cornerRadius - 1, 0);
                this.ctx.lineTo(this.r1 - this.cornerRadius, 0);
                this.ctx.arc(this.r1 - this.cornerRadius, this.cornerRadius,
                    this.cornerRadius, 1.5 * Math.PI, 0);
                this.ctx.lineTo(this.r1, this.r2 - this.cornerRadius);
                this.ctx.arc(this.r1 - this.cornerRadius, this.r2 - this.cornerRadius,
                    this.cornerRadius, 0, 0.5 * Math.PI);
                this.ctx.lineTo(this.cornerRadius, this.r2);
                this.ctx.arc(this.cornerRadius, this.r2 - this.cornerRadius,
                    this.cornerRadius, 0.5 * Math.PI, Math.PI);
                this.ctx.lineTo(0, this.cornerRadius);
                this.ctx.arc(this.cornerRadius, this.cornerRadius,
                    this.cornerRadius, Math.PI, 1.5 * Math.PI);
                this.ctx.fillStyle = this.fillColor;
                this.ctx.fill();
                this.ctx.fillStyle = this.textColor;

                // taalla laitetaan tekstia
                let textStart = this.topMargin;
                for (let i = 0; i < this.lines.length; i++) {
                    this.ctx.fillText(this.lines[i], this.leftMargin, textStart);
                    textStart += this.textHeight;
                }
                this.ctx.lineWidth = this.borderWidth;
                this.ctx.strokeStyle = this.borderColor;
                this.ctx.stroke();
                this.ctx.restore();
            },
        },

        pin: {
            init(initValues) {
                this.pinProperties = {}; // getValue(initValues.pinPoint, {});
                this.pinProperties.visible = getValueDef(initValues, "pin.visible", true);
                this.pinProperties.position = {};
                this.pinProperties.draggable = getValueDef(initValues, "pin.draggable", false);
                this.pinLength = getValueDef(initValues, "pin.length",
                    (this.type === "vector") ? 0 : 15);
                // this.pinLength = getValueDef(initValues, "pin.length", 15);
                this.pinColor = getValueDef(initValues, "pin.color",
                    getValueDef(initValues, "borderColor", "blue"));
                this.lineWidth = getValueDef(initValues, "textboxproperties.borderWidth", 2);
                this.pinDotRadius = getValueDef(initValues, "pin.dotRadius", 3);
                if (this.type === "vector")
                    this.pinPositionAlign =
                        getValueDef(initValues, "pin.position.align", "west");
                else this.pinPositionAlign = getValueDef(initValues,
                    "pin.position.align", "northwest");
                this.pinPositionStart = getValueDef(initValues, "pin.position.start", [0, 0]);
                this.pinProperties.position.coord = getValueDef(initValues,
                    "pin.position.coord", []);
                const pinst = getValueDef(initValues, "pin.position.start", [0, 0]);
                this.pinsx = getValue(pinst[0], 0);
                this.pinsy = getValue(pinst[1], 0);
                this.pinInit2();
            },

            init2() {
                // TODO: pin length so that it is always same length.
                // Now 45 deg pins are longer
                this.pinPositions = {
                    west: {x: 0, y: this.r2 / 2, off: {x: -this.pinLength, y: 0}},
                    east: {x: this.r1, y: this.r2 / 2, off: {x: this.pinLength, y: 0}},
                    north: {x: this.r1 / 2, y: 0, off: {x: 0, y: -this.pinLength}},
                    south: {x: this.r1 / 2, y: this.r2, off: {x: 0, y: this.pinLength}},
                    southeast: {
                        x: this.r1, y: this.r2,
                        off: {x: this.pinLength, y: this.pinLength}
                    },
                    northeast: {
                        x: this.r1, y: 0,
                        off: {x: this.pinLength, y: -this.pinLength}
                    },
                    southwest: {
                        x: 0, y: this.r2,
                        off: {x: -this.pinLength, y: this.pinLength}
                    },
                    northwest: {x: 0, y: 0, off: {x: -this.pinLength, y: -this.pinLength}},
                    center: {x: this.r1 / 2, y: this.r2 / 2, off: {x: 0, y: 0}},
                };
                if (this.type === "vector") {
                    this.pinPosition = getValue(this.pinPositions[this.pinPositionAlign],
                        this.pinPositions.west);
                }
                else this.pinPosition = getValue(this.pinPositions[this.pinPositionAlign],
                    this.pinPositions.northwest);
                this.pinPosition.off.x = getValue(this.pinProperties.position.coord[0],
                    this.pinPosition.off.x);
                this.pinPosition.off.y = getValue(this.pinProperties.position.coord[1],
                    this.pinPosition.off.y);
                if (this.pinProperties && this.pinProperties.visible) {
                    this.dotPosition = {
                        x: this.pinPosition.x + this.pinPosition.off.x,
                        y: this.pinPosition.y + this.pinPosition.off.y
                    };
                }
                else this.dotPosition = {x: this.pinPosition.x, y: this.pinPosition.y};
            },

            draw(objectValues) {
                this.ctx = objectValues.ctx;
                this.ctx.save();
                this.ctx.translate(objectValues.x, objectValues.y);
                this.ctx.rotate(this.a * to_radians);
                this.ctx.strokeStyle = this.pinColor;
                this.ctx.fillStyle = this.pinColor;
                this.ctx.beginPath();
                if (this.pinProperties.visible) {
                    this.ctx.arc(0, 0, this.pinDotRadius, 0, 2 * Math.PI, false);
                    this.ctx.fill();
                    this.ctx.beginPath();
                    this.ctx.moveTo(0, 0);
                    this.ctx.lineWidth = this.lineWidth;
                    if (this.draggablePin)
                        this.ctx.lineTo(this.draggableObject.x, this.draggableObject.y);
                    else
                        this.ctx.lineTo(- this.pinPosition.off.x + this.pinsx,
                            - this.pinPosition.off.y + this.pinsy);
                    this.ctx.stroke();
                }
                if (this.type === "textbox" || this.draggableObject.type === "textbox")
                    this.textbox.draw(objectValues);
                if (this.type === "img" || this.draggableObject.type === "img")
                    this.imageDraw(objectValues);
                if (this.type === "vector" || this.draggableObject.type === "vector")
                    this.vectorDraw(objectValues);
                this.ctx.restore();
            },
        },
    };

    //scope.yamlobjects = scope.attrs.markup.objects;

    // Use these to reset excercise if there is no state.
    // This esoteric marking works as a deep copy.

    try {
        if (scope.attrs.markup.objects)
            scope.yamlobjects = JSON.parse(JSON.stringify(scope.attrs.markup.objects));
    } catch (err) {
        scope.yamlobjects = [];
    }
    const userObjects = scope.attrs.markup.objects;

    const userTargets = scope.attrs.markup.targets;
    const userFixedObjects = scope.attrs.markup.fixedobjects;
    const fixedobjects = [];
    const targets = [];
    const objects = [];

    scope.defaults = scope.attrs.markup.defaults;
    scope.previousValue = {};

    if (scope.attrs.markup.background) {
        scope.attrs.markup.background.name = "background";
        const background = new FixedObject(dt, scope.attrs.markup.background);
        dt.drawObjects.push(background);
    }

    scope.previousValue = {};
    scope.error = "";

    if (userFixedObjects) {
        for (let i = 0; i < userFixedObjects.length; i++) {
            if (userFixedObjects[i])
                try {
                    fixedobjects.push(new FixedObject(dt, userFixedObjects[i], "fix" + (i + 1)));
                } catch (err) {
                    scope.error += "init fix" + (i + 1) + ": " + err + "\n";
                }
        }
    }

    scope.previousValue = {};

    if (userTargets) {
        for (let i = 0; i < userTargets.length; i++) {
            if (userTargets[i])
                try {
                    targets.push(new Target(dt, userTargets[i], "trg" + (i + 1)));
                } catch (err) {
                    scope.error += "init trg" + (i + 1) + ": " + err + "\n";
                }
        }
    }

    scope.previousValue = {};

    if (userObjects) {
        for (let i = 0; i < userObjects.length; i++) {
            if (userObjects[i])
                try {
                    const newObject = new DragObject(dt, userObjects[i], "obj" + (i + 1));
                    objects.push(newObject);
                    if (!scope.drags) {
                        scope.drags = [];
                    }
                    scope.drags.push(newObject);
                } catch (err) {
                    scope.error += "init obj" + (i + 1) + ": " + err + "\n";
                }
        }
    }

    if (scope.attrs.state && scope.attrs.state.userAnswer) {
        scope.userHasAnswered = true;
        // used to reset object positions.
        // scope.yamlobjects = scope.attrs.state.markup.objects.yamlobjects;
        // lisatty oikeiden vastausten lukemiseen ja piirtamiseen.
        const userDrags = scope.attrs.state.userAnswer.drags;
        if (objects && userDrags && userDrags.length > 0) {
            for (let i = 0; i < objects.length; i++) {
                if (!objects[i]) continue; // looks like the first may be null
                for (let j = 0; j < userDrags.length; j++) {
                    if (objects[i].did === userDrags[j].did) {
                        objects[i].position[0] = userDrags[j].position[0];
                        objects[i].position[1] = userDrags[j].position[1];
                        objects[i].x = objects[i].position[0];
                        objects[i].y = objects[i].position[1];
                    }
                }
            }
        }
    }

    for (let i = 0; i < fixedobjects.length; i++) {
        dt.drawObjects.push(fixedobjects[i]);
    }

    for (let i = 0; i < targets.length; i++) {
        dt.drawObjects.push(targets[i]);
    }

    for (let i = 0; i < objects.length; i++) {
        dt.drawObjects.push(objects[i]);
    }

    dt.draw();

    scope.objects = objects;
};

const videos = {};

imagexApp.Controller = function($scope, $http, $transclude, $sce, $interval) {
    "use strict";
    // Tata kutsutaan kerran jokaiselle pluginin esiintymalle.
    // Angular kutsuu tata koska se on sanottu direktiivifunktiossa Controlleriksi.
    // Tahan tullaan ensin ja sitten initScope-metodiin
    // Siita ei ole mitaan hajua mista se keksii talle nuo parametrit???
    if (imagexApp.TESTWITHOUTPLUGINS) return;
    $scope.imagexScope = new ImagexScope($scope);
    $scope.attrs = {};
    $scope.sce = $sce;
    $scope.http = $http;
    $scope.interval = $interval;

    // Luodaan $scope.attrs joka on avattuna sisallossa olev JSON tai HEX
    $transclude(function(clone, scope) {timHelper.initAttributes(clone, $scope);});
    $scope.errors = [];
    $scope.muokattu = false;
    $scope.result = "";
};

imagexApp.initScope = function(scope, element, attrs) {
    "use strict";
    // Tata kutsutaan kerran jokaiselle pluginin esiintymalle.
    // Angular kutsuu tata koska se on sanottu direktiivifunktiossa Link-metodiksi.
    scope.cursor = "\u0383"; //"\u0347"; // "\u02FD";
    scope.plugin = element.parent().attr("data-plugin");
    scope.taskId = element.parent().attr("id");
    scope.app = imagexApp;

    // Etsitaan kullekin attribuutille arvo joko scope.attrs tai attrs-parametrista.
    // Jos ei ole, kaytetaan oletusta.
    timHelper.set(scope, attrs, "stem");
    timHelper.set(scope, attrs, "user_id");
    timHelper.set(scope, attrs, "emotion", false);
    timHelper.set(scope, attrs, "drawLast", false);
    timHelper.set(scope, attrs, "autosave", false);
    timHelper.set(scope, attrs, "followid", "");
    timHelper.set(scope, attrs, "button", "Save");
    timHelper.set(scope, attrs, "resetText", "Reset");
    timHelper.set(scope, attrs, "state.tries", 0);
    timHelper.set(scope, attrs, "max_tries");
    timHelper.set(scope, attrs, "cols", 20);
    timHelper.set(scope, attrs, "autoupdate", 500);
    timHelper.setn(scope, "tid", attrs, ".taskID"); //vain kokeilu etta "juuresta" ottaminen toimii
    timHelper.set(scope, attrs, "extraGrabAreaHeight", 30);
    timHelper.set(scope, attrs, "background");
    // Tassa on nyt kaikki raahattavat objektit
    timHelper.set(scope, attrs, "objects", "http://localhost/static/images/jyulogo.png");
    // Tassa pitaisi olla kaikki targetit
    timHelper.set(scope, attrs, "targets");
    timHelper.set(scope, attrs, "fixedobjects");
    timHelper.set(scope, attrs, "finalanswer");

    /*
    timHelper.set(scope, attrs, "circleRadius", 30);
    timHelper.set(scope, attrs, "circleColor");
    timHelper.set(scope, attrs, "circleTransparency", 0.5);
    */

    timHelper.set(scope, attrs, "canvaswidth", 800);
    timHelper.set(scope, attrs, "canvasheight", 600);
    //timHelper.set(scope,attrs,"preview", false);
    timHelper.set(scope, attrs, "preview", scope.attrs.preview);

    // Free hand drawing things:
    scope.freeHandDrawing = new FreeHand(scope);
    const vp = $window.videoApp && videoApp.videos[scope.followid];
    if (vp) {
        scope.freeHandDrawing.videoPlayer = vp;
        scope.videoPlayer = vp;
    }
    // scope.freeHandDrawing.emotion = scope.emotion;
    timHelper.set(scope, attrs, "buttonPlay", vp ? "Aloita/Pysäytä" : "");
    timHelper.set(scope, attrs, "buttonRevert", vp ? "Video alkuun" : "");
    timHelper.set(scope, attrs, "freeHand", false); // is free hand drawing on, if "use", it it off, but usable
    let use = false;
    if (scope.freeHand == "use") {scope.freeHand = false; use = true;}
    timHelper.set(scope, attrs, "freeHandVisible", scope.freeHand || use); // is the checkbox visible
    timHelper.set(scope, attrs, "freeHandToolbar", true); // is toolbat visible
    timHelper.set(scope, attrs, "freeHandLineVisible", true); // is line checkbox visible
    timHelper.set(scope, attrs, "freeHandLine", false); // is line drawing mode on
    timHelper.set(scope, attrs, "freeHandShortCuts", true); // general shortcuts like r,b tec
    timHelper.set(scope, attrs, "freeHandShortCut", scope.freeHand || use); // f for toggle freeHand on/off
    timHelper.set(scope, attrs, "freeHandColor", scope.freeHandDrawing.params.color); //
    timHelper.set(scope, attrs, "freeHandWidth", scope.freeHandDrawing.params.w);
    timHelper.set(scope, attrs, "state.freeHandData", null);
    timHelper.set(scope, attrs, "state.freeHandData", null);
    timHelper.set(scope, attrs, "analyzeDot", false);
    timHelper.set(scope, attrs, "showTimes", false); // show times
    timHelper.set(scope, attrs, "showVideoTime", true); // show video timeo
    timHelper.set(scope, attrs, "dotVisibleTime", 1); // leave dots to screen until next dot

    scope.w = scope.freeHandWidth;
    scope.color = scope.freeHandColor;
    scope.lineMode = scope.freeHandLine;
    scope.freeHandDrawing.params = scope; // to get 2 way binding to params
    if (scope.freeHandData) scope.freeHandDrawing.freeDrawing = scope.freeHandData;
    scope.freeHandDrawing.update = function() {
        const phase = scope.$root.$$phase;
        if (phase == "$apply" || phase == "$digest") return;
        scope.$apply();
    };

    // Otsikot.  Oletetaan etta 1. elementti korvaatan header-otsikolla ja viimeinen footerilla
    element[0].childNodes[0].outerHTML = timHelper.getHeading(scope, attrs, "header", "h4");
    const n = element[0].childNodes.length;
    if (n > 1) element[0].childNodes[n - 1].outerHTML =
        timHelper.getHeading(scope, attrs, "footer", 'p class="plgfooter"');
    scope.canvas = element.find("#canvas")[0]; //element[0].childNodes[1].childNodes[0];
    scope.colorInput = element.find("#freeHandColor")[0]; //element[0].childNodes[1].childNodes[0];
    imagexApp.initDrawing(scope, scope.canvas); //element[0].childNodes[1].childNodes[0]);

    scope.coords = element.find("#coords")[0];
    scope.previewColorInput = element.find("#previewColorInput")[0];
    scope.canvas.coords = scope.coords;
    scope.previewColor = globalPreviewColor;
    scope.attrs = {}; // not needed any more
};

// Tehdaan kaikista toiminnallisista funktioista oma luokka, jotta
// niita ei erikseen lisata jokaisen pluginin esiintyman kohdalla uudelleen.
function ImagexScope(scope) {
    "use strict";
    this.scope = scope;
}

ImagexScope.prototype.watchDrags = function() {
    "use strict";
    // var $scope = this.scope;
};

ImagexScope.prototype.initCode = function() {
    "use strict";
    const $scope = this.scope;
    $scope.error = "";
    $scope.result = "";
};

ImagexScope.prototype.undo = function() {
    this.scope.freeHandDrawing.popSegment(0);
};

ImagexScope.prototype.setFColor = function(color) {
    this.scope.freeHandDrawing.setColor(color);
};

ImagexScope.prototype.getPColor = function() {
    if (this.scope.preview) {
        if (typeof (editorChangeValue) !== "undefined") {
            globalPreviewColor = this.scope.previewColorInput.value;
            editorChangeValue(["[a-zA-Z]*[cC]olor[a-zA-Z]*:"], '"' + globalPreviewColor + '"');
        }
    }

};

ImagexScope.prototype.save = function() {
    "use strict";
    this.doSave(false);
    //$scope.evalAsync( $scope.drags);
};

ImagexScope.prototype.showAnswer = function() {
    "use strict";
    this.doshowAnswer();

};

// Get the important stuff from dragobjects
ImagexScope.prototype.getDragObjectJson = function() {
    const $scope = this.scope;
    const dragtable = $scope.drags;
    const json = [];
    if (!dragtable) {
        return json;
    }
    for (let i = 0; i < dragtable.length; i++) {
        json.push({
            did: dragtable[i].did, id: dragtable[i].id,
            position: [dragtable[i].x, dragtable[i].y]
        });
    }
    return json;
};

// This is pretty much identical to the normal save except that a query to
// show correct answer is also sent.
ImagexScope.prototype.doshowAnswer = function() {
    "use strict";
    const $scope = this.scope;
    if ($scope.answer && $scope.answer.rightanswers) {
        $scope.dt.addRightAnswers();
        return;
    }

    // These break the whole javascript if used, positions are updated somehow anyways.
    // $scope.$digest();
    // $scope.$apply();

    $scope.error = "... saving ...";
    $scope.isRunning = true;
    $scope.result = "";

    const params = {
        input: {
            markup: {taskId: $scope.taskId, user_id: $scope.user_id},
            drags: this.getDragObjectJson(),
            freeHandData: this.scope.freeHandDrawing.freeDrawing,
            finalanswerquery: true,
        },
    };
    let url = "/imagex/answer";
    if ($scope.plugin) {
        url = $scope.plugin;
        const i = url.lastIndexOf("/");
        if (i > 0) url = url.substring(i);
        url += "/" + $scope.taskId + "/answer/";  // Hack piti vahan muuttaa, jotta kone haviaa.
    }

    $scope.http({method: "PUT", url, data: params, headers: {"Content-Type": "application/json"}, timeout: 20000},
    ).then(function(resp) {
        const data = resp.data;
        $scope.isRunning = false;
        $scope.error = data.web.error;
        $scope.result = data.web.result;
        $scope.tries = data.web.tries;
        // for showing right answers.
        $scope.answer = data.web.answer;
        $scope.dt.addRightAnswers();
        //$scope.imagexScope.resetExercise();

    }, function(err) {
        $scope.isRunning = false;
        $scope.errors.push(err.status);
        $scope.error = "Ikuinen silmukka tai jokin muu vika?";
    });
};

// Reset the positions of dragobjects.
ImagexScope.prototype.resetExercise = function() {
    "use strict";
    // Set scope.
    const $scope = this.scope;
    $scope.error = "";
    $scope.result = "";
    $scope.freeHandDrawing.clear();
    // Objects dragged by user.
    const objects = $scope.objects; //$scope.objects;

    if (objects) {
        for (let i = 0; i < objects.length; i++) {
            const obj = objects[i];
            obj.x = obj.origPos.x;
            obj.y = obj.origPos.y;
            obj.position = obj.origPos.pos;
        }
    }
    // Draw the excercise so that reset appears instantly.

    const dobjs = $scope.dt.drawObjects;

    for (let i = dobjs.length - 1; i--;) {
        if (dobjs[i].did === "-") dobjs.splice(i, 1);
    }
    $scope.rightAnswersSet = false;

    $scope.dt.draw();
};

ImagexScope.prototype.svgImageSnippet = function() {
    const $scope = this.scope;
    const s = $scope.sce.trustAsHtml($scope.replyHTML);
    return s;
};

ImagexScope.prototype.videoPlay = function() {
    const video = this.scope.videoPlayer;
    if (video.fakeVideo) return;
    //    var $scope = this.scope;
    //this.scope.startTime = Date.now();
    if (video.paused)
        video.play();
    else
        video.pause();
    //return startTime;
};

ImagexScope.prototype.videoBeginning = function() {
    const video = this.scope.videoPlayer;
    if (video.fakeVideo) return;
    if (video.paused)
        video.currentTime = 0;
};

ImagexScope.prototype.doSave = function(nosave) {
    "use strict";
    const $scope = this.scope;

    $scope.error = "... saving ...";
    $scope.isRunning = true;
    $scope.result = "";

    const params = {
        input: {
            markup: {taskId: $scope.taskId, user_id: $scope.user_id},
            drags: this.getDragObjectJson(),
            freeHandData: this.scope.freeHandDrawing.freeDrawing,
            nosave: false,
        },
    };

    if (nosave) params.input.nosave = true;
    let url = "/imagex/answer";
    if ($scope.plugin) {
        url = $scope.plugin;
        const i = url.lastIndexOf("/");
        if (i > 0) url = url.substring(i);
        url += "/" + $scope.taskId + "/answer/";  // Hack piti vahan muuttaa, jotta kone haviaa.
    }

    $scope.http({method: "PUT", url, data: params, headers: {"Content-Type": "application/json"}, timeout: 20000},
    ).then(function(resp) {
        const data = resp.data;
        $scope.isRunning = false;
        $scope.error = data.web.error;
        $scope.result = data.web.result;
        $scope.tries = data.web.tries;
        $scope.userHasAnswered = true;
        $scope.replyImage = data.web["-replyImage"];
        $scope.replyHTML = data.web["-replyHTML"];
    }, function(err) {
        $scope.isRunning = false;
        $scope.errors.push(err.status);
        $scope.error = "Ikuinen silmukka tai jokin muu vika?";
    });
};
