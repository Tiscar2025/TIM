var katex, $, angular, modules, version, refererPath, docId, docName, rights, startIndex, users, teacherMode, crumbs;

var timApp = angular.module('timApp', [
    'ngSanitize',
    'angularFileUpload',
    'ui.ace'].concat(modules)).config(['$httpProvider', function($httpProvider){
    var interceptor = [
        '$q',
        '$rootScope',
        function($q, $rootScope) {
            var re = /\/[^/]+\/([^/]+)\/answer\/$/;
            var service = {
                'request': function(config) {
                    if (re.test(config.url)){
                        var match = re.exec(config.url);
                        var taskId = match[1];
                        var ab = angular.element("answerbrowser[task-id='" + taskId + "']");
                        var browserScope = ab.isolateScope();
                        if (ab.scope().teacherMode) {
                            angular.extend(config.data, {abData: browserScope.getTeacherData()});
                        }
                    }
                    return config;
                },
                'response': function(response) {

                    if (re.test(response.config.url)){
                        var match = re.exec(response.config.url);
                        var taskId = match[1];
                        $rootScope.$broadcast('answerSaved', {taskId: taskId});
                    }
                    return response;
                }
            };
            return service;
        }
    ];

    $httpProvider.interceptors.push(interceptor);
}]);

timApp.controller("ViewCtrl", [
    '$scope',
    '$http',
    '$q',
    '$upload',
    '$injector',
    '$compile',
    '$window',
    '$document',
    function (sc, http, q, $upload, $injector, $compile, $window, $document) {
        "use strict";
        http.defaults.headers.common.Version = version.hash;
        http.defaults.headers.common.RefererPath = refererPath;
        sc.docId = docId;
        sc.docName = docName;
        sc.crumbs = crumbs;
        sc.rights = rights;
        sc.startIndex = startIndex;
        sc.users = users;
        sc.teacherMode = teacherMode;
        sc.sidebarState = 'autohidden';
        if (sc.users.length > 0) {
            sc.selectedUser = sc.users[0];
        } else {
            sc.selectedUser = null;
        }

        sc.noteClassAttributes = ["difficult", "unclear", "editable", "private"];
        sc.editing = false;
        var NOTE_EDITOR_CLASS = "editorArea";
        var DEFAULT_BUTTON_CLASS = "timButton defaultButton";
        var NOTE_ADD_BUTTON_CLASS = "timButton addNote";
        var NOTE_ADD_BUTTON = "." + NOTE_ADD_BUTTON_CLASS.replace(" ", ".");
        var EDITOR_CLASS = "editorArea";
        var EDITOR_CLASS_DOT = "." + EDITOR_CLASS;
        var PAR_ADD_BUTTON_CLASS = "timButton addPar";
        var PAR_ADD_BUTTON = "." + PAR_ADD_BUTTON_CLASS.replace(" ", ".");
        var PAR_EDIT_BUTTON_CLASS = "timButton editPar";
        var PAR_EDIT_BUTTON = "." + PAR_EDIT_BUTTON_CLASS.replace(" ", ".");
        var PAR_CLOSE_BUTTON_CLASS = "timButton menuClose";
        var PAR_CLOSE_BUTTON = "." + PAR_CLOSE_BUTTON_CLASS.replace(" ", ".");

        sc.processAllMath = function($elem) {
            $elem.find('.math').each(function() {
                sc.processMath(this);
            });
        };

        sc.processMath = function(elem) {
            var $this = $(elem);
            var math = $this.text();
            var hasDisplayMode = false;
            if (math[1] === '[') {
                hasDisplayMode = true;
            }
            else if (math[1] !== '(') {
                return;
            }
            katex.render(math.slice(2, -2), elem, {displayMode: hasDisplayMode});
        };

        sc.toggleSidebar = function () {
            var visible = angular.element('.sidebar').is(":visible");
            if (visible) {
                sc.sidebarState = 'hidden';
            } else {
                sc.sidebarState = 'open';
            }
        };

        sc.autoHideSidebar = function () {
            if (sc.sidebarState === 'open') {
                sc.sidebarState = 'autohidden';
            }
        };

        sc.changeUser = function (user) {
            sc.$broadcast('userChanged', {user: user});
        };

        sc.getParId = function ($par) {
            if ($par.length === 0) {
                return null;
            }
            return $par.attr("id");
        };

        sc.getElementByParId = function (id) {
            return $("#" + id);
        };

        sc.toggleParEditor = function ($par, options) {
            var url;
            var par_id = sc.getParId($par);
            var par_next_id = sc.getParId($par.next());
            if ($par.hasClass("new")) {
                url = '/newParagraph/';
            } else {
                url = '/postParagraph/';
            }

            var attrs = {
                "save-url": url,
                "extra-data": JSON.stringify({
                    docId: sc.docId,
                    par: par_id,
                    par_next: par_next_id,
                    attrs: JSON.parse($par.attr('attrs'))
                }),
                "options": JSON.stringify({
                    showDelete: options.showDelete,
                    showImageUpload: true,
                    destroyAfterSave: true
                }),
                "after-save": 'addSavedParToDom(saveData, extraData)',
                "after-cancel": 'handleCancel(extraData)',
                "after-delete": 'handleDelete(saveData, extraData)',
                "preview-url": '/preview/' + sc.docId,
                "delete-url": '/deleteParagraph/' + sc.docId + "/" + par_id
            };
            if (options.showDelete) {
                attrs["initial-text-url"] = '/getBlock/' + sc.docId + "/" + par_id;
            }
            sc.toggleEditor($par, options, attrs);
        };

        sc.toggleEditor = function ($par, options, attrs) {
            if ($par.children(EDITOR_CLASS_DOT).length) {
                $par.children().remove(EDITOR_CLASS_DOT);
                sc.editing = false;
            } else {
                $(EDITOR_CLASS_DOT).remove();

                var createEditor = function (attrs) {
                    var $div = $("<pareditor>", {class: EDITOR_CLASS}).attr(attrs);
                    $compile($div[0])(sc);
                    $par.append($div);
                    $div.attr('tim-draggable-fixed', '');
                    $div = $compile($div)(sc);
                    sc.editing = true;
                };

                if (options.showDelete) {
                    $(".par.new").remove();
                }
                createEditor(attrs);
            }
        };

        sc.toggleNoteEditor = function ($par, options) {
            if (!sc.rights.can_comment) {
                return;
            }
            var url,
                data;
            if (options.isNew) {
                url = '/postNote';
                data = {
                    access: 'everyone',
                    tags: {
                        difficult: false,
                        unclear: false
                    }
                };
            } else {
                url = '/editNote';
                data = options.noteData;
                if (!data.editable) {
                    $window.alert('You cannot edit this note.');
                    return;
                }
            }
            var par_id = sc.getParId($par),
                attrs = {
                    "save-url": url,
                    "extra-data": JSON.stringify(angular.extend({
                        docId: sc.docId,
                        par: par_id
                    }, data)),
                    "options": JSON.stringify({
                        showDelete: !options.isNew,
                        showImageUpload: false,
                        tags: [
                            {name: 'difficult', desc: 'The text is difficult to understand'},
                            {name: 'unclear', desc: 'The text is unclear'}
                        ],
                        choices: {desc: [{
                            desc: 'Show note to:',
                            name: 'access',
                            opts: [
                                {desc: 'Everyone', value: 'everyone'},
                                {desc: 'Just me', value: 'justme'}
                            ]
                        }]},
                        destroyAfterSave: true
                    }),
                    "after-save": 'handleNoteSave(saveData, extraData)',
                    "after-cancel": 'handleNoteCancel(extraData)',
                    "after-delete": 'handleNoteDelete(saveData, extraData)',
                    "preview-url": '/preview/' + sc.docId,
                    "delete-url": '/deleteNote',
                    "editor-text": data.content
                };
            sc.toggleEditor($par, options, attrs);
        };

        sc.forEachParagraph = function (func) {
            $('.paragraphs .par').each(func);
        };

        // Event handlers

        sc.fixPageCoords = function(e) {
            if ( !('pageX' in e) || (e.pageX == 0 && e.pageY == 0) ) {
                e.pageX = e.originalEvent.touches[0].pageX;
                e.pageY = e.originalEvent.touches[0].pageY;
                }
                return e;
        };

        sc.onClick = function (className, func) {
            var downEvent = null;
            var downCoords = null;

            $document.on('mousedown touchstart', className, function (e) {
                downEvent = sc.fixPageCoords(e);
                downCoords = {left: downEvent.pageX, top: downEvent.pageY};
            });
            $document.on('mousemove touchmove', className, function (e) {
                if (downEvent == null)
                    return;

                var e2 = sc.fixPageCoords(e);
                if (sc.dist(downCoords, {left: e2.pageX, top: e2.pageY}) > 10) {
                    // Moved too far away, cancel the event
                    downEvent = null;
                }
            });
            $document.on('touchcancel', className, function (e) {
                console.log("cancel");
                downEvent = null;
            });
            $document.on('mouseup touchend', className, function (e) {
                if ( downEvent != null ) {
                    if ( func($(this), downEvent) ) {
                        e.preventDefault();
                    }
                    downEvent = null;
                }
            });
        };

        sc.showEditWindow = function (e, $par, coords) {
            sc.toggleParEditor($par, {showDelete: true});
        };

        sc.onClick(PAR_EDIT_BUTTON, function ($this, e) {
            var $par = $(e.target).parent().parent().parent();
            $(".par.new").remove();
            sc.toggleActionButtons(e, $par, false, false, null);
            sc.showEditWindow(e, $par, null)
            return true;
        });

        sc.onClick("#defaultEdit", function ($this, e) {
            var $par = $(e.target).parent().parent().parent();
            sc.toggleActionButtons(e, $par, false, false, null);
            sc.defaultAction = sc.showEditWindow;
            return true;
        });

        sc.createNewPar = function() {
            return $("<div>", {class: "par new", id: 'NEW_PAR', attrs: '{}'})
                .append($("<div>", {class: "parContent"}).html('New paragraph'));
        };

        sc.showAddParagraphAbove = function(e, $par, coords) {
            var $newpar = sc.createNewPar();
            $par.before($newpar);
            sc.toggleParEditor($newpar, {showDelete: false});
        };

        sc.showAddParagraphBelow = function(e, $par, coords) {
            var $newpar = sc.createNewPar();
            $par.after($newpar);
            sc.toggleParEditor($newpar, {showDelete: false});
        };

        sc.onClick(PAR_ADD_BUTTON, function ($this, e) {
            var $par = $(e.target).parent().parent().parent();
            $(".par.new").remove();
            sc.toggleActionButtons(e, $par, false, false, null);
            var $newpar = sc.createNewPar();

            if ($(e.target).hasClass("above")) {
                $par.before($newpar);
            } else if ($(e.target).hasClass("below")) {
                $par.after($newpar);
            }

            sc.toggleParEditor($newpar, {showDelete: false});
            return true;
        });

        sc.onClick("#defaultPrepend", function ($this, e) {
            var $par = $(e.target).parent().parent().parent();
            sc.toggleActionButtons(e, $par, false, false, null);
            sc.defaultAction = sc.showAddParagraphAbove;
            return true;
        });

        sc.onClick("#defaultAppend", function ($this, e) {
            var $par = $(e.target).parent().parent().parent();
            sc.toggleActionButtons(e, $par, false, false, null);
            sc.defaultAction = sc.showAddParagraphBelow;
            return true;
        });

        sc.doNothing = function (e, $par, coords) {
            sc.toggleActionButtons(e, $par, false, false, null);
        };

        sc.onClick(PAR_CLOSE_BUTTON, function ($this, e) {
            var $par = $(e.target).parent().parent().parent();
            $(".par.new").remove();
            sc.toggleActionButtons(e, $par, false, false, null);
            return true;
        });

        sc.onClick("#defaultClose", function ($this, e) {
            var $par = $(e.target).parent().parent().parent();
            sc.toggleActionButtons(e, $par, false, false, null);
            sc.defaultAction = sc.doNothing;
            return true;
        });

        sc.handleCancel = function (extraData) {
            var $par = sc.getElementByParId(extraData.par);
            if ($par.hasClass("new")) {
                $par.remove();
            }
            sc.editing = false;
        };

        sc.handleDelete = function (data, extraData) {
            var $par = sc.getElementByParId(extraData.par);
            http.defaults.headers.common.Version = data.version;
            $par.remove();
            sc.editing = false;
        };

        sc.addSavedParToDom = function (data, extraData) {
            var $par = sc.getElementByParId(extraData.par),
                len = data.texts.length;
            http.defaults.headers.common.Version = data.version;
            for (var i = len - 1; i >= 0; i--) {
                var html = data.texts[i].html;
                if ('taskId' in data.texts[i].attrs) {
                    html = $compile(html)(sc);
                }
                var classes = [];
                if ('classes' in data.texts[i].attrs) {
                    classes = data.texts[i].attrs.classes;
                }
                var $newpar = $("<div>", {
                    class: ["par"].concat(classes).join(" "),
                    id: data.texts[i].id,
                    t: data.texts[i].t,
                    attrs: JSON.stringify(data.texts[i].attrs)
                })
                    .append($("<div>", {class: "parContent"}).html(html));
                var readClass = "unread";
                var old_t = "";
                if (i === 0 && !$par.hasClass("new")) {
                    old_t = $par.find(".readline").attr("t");
                    $par.find(".notes").appendTo($newpar);
                    if (old_t !== data.texts[i].t) {
                        readClass = "modified";
                    } else {
                        readClass = "read";
                    }
                }
                if ('taskId' in data.texts[i].attrs) {
                    var ab = $('<answerbrowser>').attr('task-id', sc.docId + '.' + data.texts[i].attrs.taskId);
                    $compile(ab[0])(sc);
                    ab.prependTo($newpar);
                }
                $par.after($newpar.append($("<div>",
                    {class: "readline " + readClass, title: "Click to mark this paragraph as read", t: old_t})));
                sc.processMath($newpar[0]);
            }
            $par.remove();
            sc.editing = false;
        };

        sc.onClick(".readline", function ($this, e) {
            var par_id = sc.getParId($this.parents('.par'));
            var oldClass = $this.attr("class");
            $this.attr("class", "readline read");
            http.put('/read/' + sc.docId + '/' + par_id + '?_=' + Date.now())
                .success(function (data, status, headers, config) {
                    // No need to do anything here
                }).error(function (data, status, headers, config) {
                    $window.alert('Could not save the read marking.');
                    $this.attr("class", oldClass);
                });
            return true;
        });

        sc.showNoteWindow = function (e, $par, coords) {
            sc.toggleNoteEditor($par, {isNew: true});
        };

        sc.onClick(NOTE_ADD_BUTTON, function ($this, e) {
            var $par = $(e.target).parent().parent().parent();
            sc.toggleActionButtons(e, $par, false, false, null);
            sc.showNoteWindow(e, $par, null);
            return true;
        });

        sc.onClick("#defaultAdd", function ($this, e) {
            var $par = $(e.target).parent().parent().parent();
            sc.toggleActionButtons(e, $par, false, false, null);
            sc.defaultAction = sc.showNoteWindow;
            return true;
        });

        sc.handleNoteCancel = function (extraData) {
            sc.editing = false;
        };

        sc.handleNoteDelete = function (data, extraData) {
            sc.getNotes();
            sc.editing = false;
        };

        sc.handleNoteSave = function (data, extraData) {
            sc.getNotes();
            sc.editing = false;
        };

        sc.onClick('.paragraphs .parContent', function ($this, e) {
            if (sc.editing) {
                return false;
            }

            sc.autoHideSidebar();
            sc.$apply();

            var $target = $(e.target);
            var tag = $target.prop("tagName");

            // Don't show paragraph menu on these specific tags or class
            var ignoredTags = ['BUTTON', 'INPUT', 'TEXTAREA', 'A'];
            if (ignoredTags.indexOf(tag) > -1 || $target.parents('.no-popup-menu').length > 0) {
                return false;
            }

            var $par = $this.parent();
            var coords = { left: e.pageX - $par.offset().left, top: e.pageY - $par.offset().top };
            var toggle1 = $par.find(".actionButtons").length === 0;
            var toggle2 = $par.hasClass("lightselect");

            $(".par.selected").removeClass("selected");
            $(".par.lightselect").removeClass("lightselect");
            $(".actionButtons").remove();
            sc.toggleActionButtons(e, $par, toggle1, toggle2, coords);
            return true;
        });

        sc.onClick(".noteContent", function ($this, e) {
            sc.toggleNoteEditor($this.parent().parent().parent(), {isNew: false, noteData: $this.parent().data()});
            return true;
        });


        // Note-related functions

        sc.showOptionsWindow = function(e, $par, coords) {
            var default_width = $par.outerWidth() / 16;
            var button_width = $par.outerWidth() / 4 - 1.7 * default_width;
            var $actionDiv = $("<div>", {class: 'actionButtons'});
            if (sc.rights.can_comment){
                var $span = $("<span>");
                $span.append($("<button>", {class: NOTE_ADD_BUTTON_CLASS, text: 'Comment/note', width: button_width}));
                $span.append($("<button>", {id: 'defaultAdd', class: DEFAULT_BUTTON_CLASS, text: 'Default', width: default_width}));
                $actionDiv.append($span);
            }
            if (sc.rights.editable) {
                var $span = $("<span>");
                $span.append($("<button>", {class: PAR_EDIT_BUTTON_CLASS, text: 'Edit', width: button_width}));
                $span.append($("<button>", {id: 'defaultEdit', class: DEFAULT_BUTTON_CLASS, text: 'Default', width: default_width}));
                $actionDiv.append($span);

                var $span = $("<span>");
                $span.append($("<button>", {
                    class: PAR_ADD_BUTTON_CLASS + ' above',
                    text: 'Add paragraph above',
                    width: button_width
                }));
                $span.append($("<button>", {id: 'defaultPrepend', class: DEFAULT_BUTTON_CLASS, text: 'Default', width: default_width}));
                $actionDiv.append($span);

                var $span = $("<span>");
                $span.append($("<button>", {
                    class: PAR_ADD_BUTTON_CLASS + ' below',
                    text: 'Add paragraph below',
                    width: button_width
                }));
                $span.append($("<button>", {id: 'defaultAppend', class: DEFAULT_BUTTON_CLASS, text: 'Default', width: default_width}));
                $actionDiv.append($span);

                var $span = $("<span>");
                $span.append($("<button>", {class: PAR_CLOSE_BUTTON_CLASS, text: 'Close menu', width: button_width}));
                $span.append($("<button>", {id: 'defaultClose', class: DEFAULT_BUTTON_CLASS, text: 'Default', width: default_width}));
                $actionDiv.append($span);
            }
            $actionDiv.offset(coords);
            $actionDiv.css('position', 'absolute'); // IE needs this
            $actionDiv.attr('tim-draggable-fixed', '');
            $actionDiv = $compile($actionDiv)(sc);
            $par.prepend($actionDiv);
        };

        sc.dist = function(coords1, coords2) {
            return Math.sqrt( Math.pow(coords2.left - coords1.left, 2) + Math.pow(coords2.top - coords1.top, 2) );
        };

        sc.toggleActionButtons = function (e, $par, toggle1, toggle2, coords) {
            if (!sc.rights.editable && !sc.rights.can_comment) {
                return;
            }
            if (toggle2) {
                // Clicked twice successively
                var clicktime = new Date().getTime() - sc.lastclicktime;
                var clickdelta = sc.dist(coords, sc.lastclickplace);
                $par.addClass("selected");

                if (clickdelta > 10) {
                    // Selecting text
                    $par.removeClass("selected");
                    $par.removeClass("lightselect");
                }
                else if (clicktime < 500) {
                    // Double click
                    sc.defaultAction(e, $par, coords);
                }
                else {
                    // Two clicks
                    sc.showOptionsWindow(e, $par, coords);
                }
            } else if (toggle1) {
                // Clicked once
                $par.addClass("lightselect");
                sc.lastclicktime = new Date().getTime();
                sc.lastclickplace = coords;
            } else {
                $par.children().remove(".actionButtons");
                $par.removeClass("selected");
                $par.removeClass("lightselect");
            }
        };

        sc.getNoteHtml = function (notes) {
            var $noteDiv = $("<div>", {class: 'notes'});
            for (var i = 0; i < notes.length; i++) {
                var classes = ["note"];
                for (var j = 0; j < sc.noteClassAttributes.length; j++) {
                    if (notes[i][sc.noteClassAttributes[j]] || notes[i].tags[sc.noteClassAttributes[j]]) {
                        classes.push(sc.noteClassAttributes[j]);
                    }
                }
                $noteDiv.append($("<div>", {class: classes.join(" ")})
                    .data(notes[i])
                    .append($("<div>", {class: 'noteContent', html: notes[i].html})));
            }
            return $noteDiv;
        };

        sc.getNotes = function () {
            var rn = "?_=" + Date.now();

            http.get('/notes/' + sc.docId + rn).success(function (data, status, headers, config) {
                $('.notes').remove();
                var pars = {};

                var noteCount = data.length;
                for (var i = 0; i < noteCount; i++) {
                    var pi = data[i].par_id;
                    if (!(pi in pars)) {
                        pars[pi] = {notes: []};

                    }
                    if (!('notes' in pars[pi])) {
                        pars[pi].notes = [];
                    }
                    pars[pi].notes.push(data[i]);
                }
                Object.keys(pars).forEach(function(par_id, index) {
                    var $par = sc.getElementByParId(par_id);
                    var $notediv = sc.getNoteHtml(pars[par_id].notes);
                    $par.append($notediv);
                    sc.processAllMath($par);
                });
            }).error(function (data, status, headers, config) {
                $window.alert("Could not fetch notes.");
            });
        };

        sc.getReadPars = function () {
            if (!sc.rights.can_mark_as_read) {
                return;
            }
            var rn = "?_=" + Date.now();
            http.get('/read/' + sc.docId + rn).success(function (data, status, headers, config) {
                var readCount = data.length;
                $('.readline').remove();
                var pars = {};
                for (var i = 0; i < readCount; i++) {
                    var readPar = data[i];
                    var pi = data[i].par_id;
                    if (!(pi in pars)) {
                        pars[pi] = {par_hash: data[i].par_hash};
                    }
                }
                sc.forEachParagraph(function (index, elem) {
                    var $par = $(elem);
                    var hash = $par.attr('t');
                    var par_id = $par.attr('id');
                    var classes = ["readline"];
                    if (par_id in pars) {
                        var status = 'read';
                        if (hash !== pars[par_id].par_hash) {
                            status = 'modified';
                        }
                        classes.push(status);
                    } else {
                        classes.push("unread");
                    }
                    var $div = $("<div>", {
                        class: classes.join(" "),
                        title: "Click to mark this paragraph as read",
                        t: pars[par_id].par_hash});
                    $(this).append($div);
                });
            }).error(function (data, status, headers, config) {
                $window.alert("Could not fetch reading info.");
            });
        };

        sc.markAllAsRead = function() {
            http.put('/read/' + sc.docId + '?_=' + Date.now())
                .success(function (data, status, headers, config) {
                    $('.readline').attr("class", "readline read");
                }).error(function (data, status, headers, config) {
                    $window.alert('Could not mark the document as read.');
                });
        };

        sc.setHeaderLinks = function () {
            $(".par h1, .par h2, .par h3, .par h4, .par h5, .par h6").each(function () {
                var $par = $(this).parent();
                $par.append($("<a>", {
                    text: '#',
                    href: '#' + $(this).attr('id'),
                    class: 'headerlink',
                    title: 'Permanent link'
                }));
            });
        };

        // Index-related functions

        sc.totext = function (str) {
            if (str.indexOf('{') > 0) {
                return str.substring(0, str.indexOf('{')).trim();
            }
            return str;
        };

        sc.tolink = function (str) {
            if (str.indexOf('{') >= 0 && str.indexOf('}') > 0) {
                var ob = str.indexOf('{');
                var cb = str.indexOf('}');
                return str.substring(ob + 1, cb);
            }
            return "#" + str.replace(/^(\d)+(\.\d+)*\.? /, "").replace(/[^\d\wåäö\.\- ]/gi, "").trim().replace(/ +/g, '-').toLowerCase();
        };

        sc.findIndexLevel = function (str) {
            for (var i = 0; i < str.length; i++) {
                if (str.charAt(i) !== '#') {
                    return i;
                }
            }

            return 0;
        };

        sc.getIndex = function () {
            http.get('/index/' + sc.docId).success(function (data, status, headers, config) {
                var parentEntry = null;
                sc.indexTable = [];

                for (var i = 0; i < data.length; i++) {
                    var lvl = sc.findIndexLevel(data[i]);
                    if (lvl < 1 || lvl > 3) {
                        continue;
                    }

                    var astyle = "a" + lvl;
                    var txt = data[i].substr(lvl);
                    txt = txt.trim().replace(/\\#/g, "#");
                    var entry = {
                        text: sc.totext(txt),
                        target: sc.tolink(txt),
                        style: astyle,
                        level: lvl,
                        items: [],
                        state: ""
                    };

                    if (lvl === 1) {
                        if (parentEntry !== null) {
                            if ("items" in parentEntry && parentEntry.items.length > 0) {
                                parentEntry.state = 'col';
                            }
                            sc.indexTable.push(parentEntry);
                        }

                        parentEntry = entry;
                    }
                    else if (parentEntry !== null) {
                        if (!("items" in parentEntry)) {
                            // For IE
                            parentEntry.items = [];
                        }
                        parentEntry.items.push(entry);
                    }
                }

                if (parentEntry !== null) {
                    if (parentEntry.items.length > 0) {
                        parentEntry.state = 'col';
                    }
                    sc.indexTable.push(parentEntry);
                }
            }).error(function (data, status, headers, config) {
                $window.alert("Could not fetch index entries.");
            });
        };

        sc.invertState = function (state) {
            if (state === 'exp') {
                return 'col';
            }
            if (state === 'col') {
                return 'exp';
            }
            return state;
        };

        sc.clearSelection = function () {
            if ($document.selection) {
                $document.selection.empty();
            }
            else if ($window.getSelection) {
                $window.getSelection().removeAllRanges();
            }
        };

        sc.invertStateClearSelection = function (event, state) {
            if (event.which !== 1) {
                // Listen only to the left mouse button
                return state;
            }
            if (event.target.className === 'a2' || event.target.className === 'a3') {
                // Do not collapse/expand if a subentry is clicked
                return state;
            }

            var newState = sc.invertState(state);
            if (newState !== state) {
                sc.clearSelection();
            }
            return newState;
        };

        // Load index, notes and read markings
        sc.setHeaderLinks();
        sc.indexTable = [];
        sc.getIndex();
        sc.getNotes();
        sc.getReadPars();
        sc.processAllMath($('body'));

        sc.defaultAction = sc.showOptionsWindow;
    }]);
