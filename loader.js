/**  The Emularity; easily embed emulators
 *  Copyright © 2014-2016 Daniel Brooks <db48x@db48x.net>, Jason
 *  Scott <jscott@archive.org>, Grant Galitz <grantgalitz@gmail.com>,
 *  John Vilk <jvilk@cs.umass.edu>, and Tracey Jaquith <tracey@archive.org>
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

var Module = null;

(function (Promise) {

    /**
     * BaseLoader
     */
    function BaseLoader() {
        return Array.prototype.reduce.call(arguments, extend);
    }

    BaseLoader.canvas = function (id) {
        var elem = id instanceof Element ? id : document.getElementById(id);
        return { canvas: elem };
    };

    BaseLoader.emulatorJS = function (url) {
        return { emulatorJS: url };
    };

    BaseLoader.emulatorWASM = function (url) {
        return { emulatorWASM: url };
    };

    BaseLoader.locateAdditionalEmulatorJS = function (func) {
        return { locateAdditionalJS: func };
    };

    BaseLoader.fileSystemKey = function (key) {
        return { fileSystemKey: key };
    };

    BaseLoader.nativeResolution = function (width, height) {
        if (typeof width !== 'number' || typeof height !== 'number')
            throw new Error("Width and height must be numbers");
        return { nativeResolution: { width: Math.floor(width), height: Math.floor(height) } };
    };

    BaseLoader.aspectRatio = function (ratio) {
        if (typeof ratio !== 'number')
            throw new Error("Aspect ratio must be a number");
        return { aspectRatio: ratio };
    };

    BaseLoader.scale = function (scale) {
        return { scale: scale };
    };

    BaseLoader.sampleRate = function (rate) {
        return { sample_rate: rate };
    };

    BaseLoader.muted = function (muted) {
        return { muted: muted };
    };

    BaseLoader.mountZip = function (drive, file) {
        return { files: [{ drive: drive,
                mountpoint: "/" + drive,
                file: file
            }] };
    };

    BaseLoader.mountFile = function (filename, file) {
        return { files: [{ mountpoint: filename,
                file: file
            }] };
    };

    BaseLoader.fetchFile = function (title, url) {
        return { title: title, url: url, optional: false };
    };

    BaseLoader.fetchOptionalFile = function (title, url) {
        return { title: title, url: url, optional: true };
    };

    BaseLoader.localFile = function (title, data) {
        return { title: title, data: data };
    };

    /**
     * DosBoxLoader
     */
    function DosBoxLoader() {
        var config = Array.prototype.reduce.call(arguments, extend);
        config.emulator_arguments = build_dosbox_arguments(config.emulatorStart, config.files, config.extra_dosbox_args);
        config.runner = EmscriptenRunner;
        return config;
    }
    DosBoxLoader.__proto__ = BaseLoader;

    DosBoxLoader.startExe = function (path) {
        return { emulatorStart: path };
    };

    DosBoxLoader.extraArgs = function (args) {
        return { extra_dosbox_args: args };
    };

    DosBoxLoader.mountZip = function (drive, file, drive_type) {
        //  driver type: hdd, floppy, cdrom
        return { files: [{ drive: drive,
                mountpoint: "/" + drive,
                file: file,
                drive_type: drive_type || "hdd",
            }] };
    };

    var build_dosbox_arguments = function (emulator_start, files, extra_args) {
        var args = ['-conf', '/emulator/dosbox.conf'];
        var len = files.length;
        for (var i = 0; i < len; i++) {
            if ('drive' in files[i]) {
                //  See also https://www.dosbox.com/wiki/MOUNT
                if(files[i].drive_type==='hdd'){
                    args.push('-c', 'mount '+ files[i].drive +' /emulator'+ files[i].mountpoint);
                }
                else if(files[i].drive_type==='floppy'){
                    args.push('-c', 'mount '+ files[i].drive +' /emulator'+ files[i].mountpoint + ' -t floppy');
                }
                else if(files[i].drive_type==='cdrom'){
                    args.push('-c', 'mount '+ files[i].drive +' /emulator'+ files[i].mountpoint + ' -t cdrom');
                }
            }
        }

        if (extra_args) {
            args = args.concat(extra_args);
        }

        var path = emulator_start.split(/\\|\//); // I have LTS already
        args.push('-c', /^[a-zA-Z]:$/.test(path[0]) ? path.shift() : 'c:');
        var prog = path.pop();
        if (path && path.length)
            args.push('-c', 'cd '+ path.join('/'));
        args.push('-c', prog);

        return args;
    };

    /*
     * EmscriptenRunner
     */
    function EmscriptenRunner(canvas, game_data) {
        var self = this;
        this._canvas = canvas;
        this._hooks = { start: [], reset: [] };
        // This is somewhat wrong, because our Emscripten-based emulators
        // are currently compiled to start immediately when their js file
        // is loaded.
        Module = { arguments: game_data.emulator_arguments,
            screenIsReadOnly: true,
            print: function (text) { console.log(text); },
            printErr: function (text) { console.log(text); },
            canvas: canvas,
            noInitialRun: false,
            locateFile: game_data.locateAdditionalJS,
            wasmBinary: game_data.wasmBinary,
            preInit: function () {
                // Re-initialize BFS to just use the writable in-memory storage.
                BrowserFS.initialize(game_data.fs);
                var BFS = new BrowserFS.EmscriptenFS();
                // Mount the file system into Emscripten.
                FS.mkdir('/emulator');
                FS.mount(BFS, {root: '/'}, '/emulator');
            },
            preRun: [function () {
                self._hooks.start.forEach(function (f) {
                    //try {
                    f && f();
                    //} catch(x) {
                    //  console.warn(x);
                    //}
                });
            }]
        };
    }

    EmscriptenRunner.prototype.start = function () {
    };

    EmscriptenRunner.prototype.pause = function () {
    };

    EmscriptenRunner.prototype.stop = function () {
    };

    EmscriptenRunner.prototype.mute = function () {
        try {
            if (!SDL_PauseAudio)
                SDL_PauseAudio = Module.cwrap('SDL_PauseAudio', '', ['number']);
            SDL_PauseAudio(true);
        } catch (x) {
            console.log("Unable to change audio state:", x);
        }
    };

    EmscriptenRunner.prototype.unmute = function () {
        try {
            if (!SDL_PauseAudio)
                SDL_PauseAudio = Module.cwrap('SDL_PauseAudio', '', ['number']);
            SDL_PauseAudio(false);
        } catch (x) {
            console.log("Unable to change audio state:", x);
        }
    };

    EmscriptenRunner.prototype.onStarted = function (func) {
        this._hooks.start.push(func);
    };

    EmscriptenRunner.prototype.onReset = function (func) {
        this._hooks.reset.push(func);
    };

    EmscriptenRunner.prototype.requestFullScreen = function () {
        this._canvas.requestFullscreen();
    };

    /**
     * Emulator
     */
    function Emulator(canvas, callbacks, loadFiles) {
        if (typeof callbacks !== 'object') {
            callbacks = { before_emulator: null,
                before_run: callbacks };
        }
        var js_url;
        var requests = [];
        var drawloadingtimer;
        // TODO: Have an enum value that communicates the current state of the emulator, e.g. 'initializing', 'loading', 'running'.
        var has_started = false;
        var loading = false;
        var defaultSplashColors = { foreground: 'white',
            background: 'black',
            failure: 'red' };
        var splash = { loading_text: "",
            spinning: true,
            finished_loading: false,
            colors: defaultSplashColors,
            table: null,
            splashimg: new Image() };

        var runner;

        var muted = false;
        var SDL_PauseAudio;
        this.isMuted = function () { return muted; };
        this.mute = function () { return this.setMute(true); };
        this.unmute = function () { return this.setMute(false); };
        this.toggleMute = function () { return this.setMute(!muted); };
        this.setMute = function (state) {
            muted = state;
            if (runner) {
                if (state) {
                    runner.mute();
                } else {
                    runner.unmute();
                }
            }
            else {
                try {
                    if (!SDL_PauseAudio)
                        SDL_PauseAudio = Module.cwrap('SDL_PauseAudio', '', ['number']);
                    SDL_PauseAudio(state);
                } catch (x) {
                    console.log("Unable to change audio state:", x);
                }
            }
            return this;
        };

        // This is the bare minimum that will allow gamepads to work. If
        // we don't listen for them then the browser won't tell us about
        // them.
        // TODO: add hooks so that some kind of UI can be displayed.
        window.addEventListener("gamepadconnected",
            function (e) {
                console.log("Gamepad connected at index %d: %s. %d buttons, %d axes.",
                    e.gamepad.index, e.gamepad.id,
                    e.gamepad.buttons.length, e.gamepad.axes.length);
            });

        window.addEventListener("gamepaddisconnected",
            function (e) {
                console.log("Gamepad disconnected from index %d: %s",
                    e.gamepad.index, e.gamepad.id);
            });

        var css_resolution, aspectRatio;
        // right off the bat we set the canvas's inner dimensions to
        // whatever it's current css dimensions are; this isn't likely to be
        // the same size that dosbox/jsmame will set it to, but it avoids
        // the case where the size was left at the default 300x150
        if (!canvas.hasAttribute("width")) {
            var style = getComputedStyle(canvas);
            canvas.width = parseInt(style.width, 10);
            canvas.height = parseInt(style.height, 10);
        }

        this.setSplashImage = function(_splashimg) {
            if (_splashimg) {
                if (_splashimg instanceof Image) {
                    if (splash.splashimg.parentNode) {
                        splash.splashimg.src = _splashimg.src;
                    } else {
                        splash.splashimg = _splashimg;
                    }
                } else {
                    splash.splashimg.src = _splashimg;
                }
            }
            return this;
        };

        this.setCSSResolution = function(_resolution) {
            css_resolution = _resolution;
            return this;
        };

        this.setAspectRatio = function(_aspectRatio) {
            aspectRatio = _aspectRatio;
            return this;
        };

        this.setCallbacks = function(_callbacks) {
            if (typeof _callbacks !== 'object') {
                callbacks = { before_emulator: null,
                    before_run: _callbacks };
            } else {
                callbacks = _callbacks;
            }
            return this;
        };

        this.setSplashColors = function (colors) {
            splash.colors = colors;
            return this;
        };

        this.setLoad = function (loadFunc) {
            loadFiles = loadFunc;
            return this;
        };

        var start = function (options) {
            if (has_started)
                return false;
            has_started = true;
            var defaultOptions = { waitAfterDownloading: false,
                hasCustomCSS: false };
            if (typeof options !== 'object') {
                options = defaultOptions;
            } else {
                options.__proto__ = defaultOptions;
            }

            var k, c, game_data;
            setupSplash(canvas, splash, options);
            drawsplash();

            var loading;

            splash.setTitle("Loading game");

            if (typeof loadFiles === 'function') {
                loading = loadFiles(fetch_file, splash);
            } else {
                loading = Promise.resolve(loadFiles);
            }
            loading.then(function (_game_data) {
                return new Promise(function(resolve, reject) {
                    var InMemoryFS = BrowserFS.FileSystem.InMemory;
                    InMemoryFS.Create(function (e, inMemory) {
                        // If the browser supports IndexedDB storage, mirror writes to that storage
                        // for persistence purposes.
                        if (BrowserFS.FileSystem.IndexedDB.isAvailable()) {
                            var AsyncMirrorFS = BrowserFS.FileSystem.AsyncMirror,
                                IndexedDBFS = BrowserFS.FileSystem.IndexedDB,
                                fileSystemKey = "fileSystemKey" in _game_data ? _game_data.fileSystemKey : "emularity";
                            IndexedDBFS.Create({ storeName: fileSystemKey },
                                function(e, idbfs) {
                                    if (e) {
                                        finish(e, inMemory);
                                    } else {
                                        var asyncfs = AsyncMirrorFS.Create({ sync: inMemory, async: idbfs },
                                            finish);
                                    }
                                });
                        } else {
                            finish(e, inMemory);
                        }
                    });

                    function finish(e, deltaFS) {
                        this.dFS = deltaFS;
                        game_data = _game_data;

                        var deltafs = deltaFS;

                        // Any file system writes to MountableFileSystem will be written to the
                        // deltaFS, letting us mount read-only zip files into the MountableFileSystem
                        // while being able to "write" to them.
                        var MountableFS = BrowserFS.FileSystem.MountableFileSystem,
                            OverlayFS = BrowserFS.FileSystem.OverlayFS,
                            ZipFS = BrowserFS.FileSystem.ZipFS,
                            Buffer = BrowserFS.BFSRequire('buffer').Buffer;
                        MountableFS.Create(function (e, mountable) {
                            OverlayFS.Create({ readable: mountable
                                    , writable: deltaFS
                                },
                                function (e, fs) {
                                    if (e) {
                                        console.error("Failed to initialize the OverlayFS:", e);
                                        reject();
                                    } else {
                                        game_data.fs = fs;
                                        function fetch(file) {
                                            var isCached = 'cached' in file && file.cached,
                                                hasData = 'data' in file && file.data !== null && typeof file.data !== 'undefined';
                                            if (isCached || hasData) {
                                                return cached_file(file.title, file.data);
                                            } else {
                                                return fetch_file(file.title, file.url, 'arraybuffer', file.optional);
                                            }
                                        }
                                        function mountat(drive) {
                                            return function (data) {
                                                if (data !== null) {
                                                    drive = drive.toLowerCase();
                                                    var mountpoint = '/'+ drive;
                                                    // Mount into RO MFS.
                                                    return new Promise(function (resolve, reject) {
                                                        return new ZipFS.Create({ zipData: new Buffer(data) },
                                                            function (e, fs) {
                                                                if (e) {
                                                                    reject();
                                                                } else {
                                                                    mountable.mount(mountpoint, fs);
                                                                    resolve();
                                                                }
                                                            });
                                                    });
                                                }
                                            };
                                        }
                                        function saveat(filename) {
                                            return function (data) {
                                                if (data !== null) {
                                                    if (deltaFS.existsSync(filename)) {
                                                        return;
                                                    }
                                                    if (filename.includes('/', 1)) {
                                                        var parts = filename.substring(1).split('/');
                                                        for (var i = 1; i < parts.length; i++) {
                                                            var path = '/'+ parts.slice(0, i).join('/');
                                                            if (!deltaFS.existsSync(path)) {
                                                                deltaFS.mkdirSync(path, 0777);
                                                            }
                                                        }
                                                    }
                                                    deltaFS.writeFileSync(filename, new Buffer(data), null, flag_w, 0644);
                                                }
                                            };
                                        }
                                        var promises = game_data.files
                                            .map(function (f) {
                                                if (f && f.file) {
                                                    if (f.drive) {
                                                        return fetch(f.file).then(mountat(f.drive));
                                                    } else if (f.mountpoint) {
                                                        var path = f.mountpoint[0] != '/' ? '/'+ f.mountpoint : f.mountpoint;
                                                        f.file.cached = deltaFS.existsSync(path);
                                                        return fetch(f.file).then(saveat(path));
                                                    }
                                                }
                                                return null;
                                            });
                                        // this is kinda wrong; it really only applies when we're loading something created by Emscripten
                                        if ('emulatorWASM' in game_data && game_data.emulatorWASM && 'WebAssembly' in window) {
                                            promises.push(fetch({ title: "WASM Binary", url: game_data.emulatorWASM }).then(function (data) { game_data.wasmBinary = data; }));
                                        }
                                        Promise.all(promises).then(resolve, reject);
                                    }
                                });
                        });
                    }
                });
            })
                .then(function (game_files) {
                        if (!game_data || splash.failed_loading) {
                            return null;
                        }
                        if (options.waitAfterDownloading) {
                            return new Promise(function (resolve, reject) {
                                splash.setTitle("Press any key to continue...");
                                splash.spinning = false;

                                // stashes these event listeners so that we can remove them after
                                window.addEventListener('keypress', k = keyevent(resolve));
                                canvas.addEventListener('click', c = resolve);
                                splash.splashElt.addEventListener('click', c);
                            });
                        }
                        return Promise.resolve();
                    },
                    function () {
                        if (splash.failed_loading) {
                            return;
                        }
                        splash.setTitle("Failed to download game data!");
                        splash.failed_loading = true;
                    })
                .then(function () {
                        if (!game_data || splash.failed_loading) {
                            return null;
                        }
                        splash.spinning = true;
                        window.removeEventListener('keypress', k);
                        canvas.removeEventListener('click', c);
                        splash.splashElt.removeEventListener('click', c);

                        // Don't let arrow, pg up/down, home, end affect page position
                        blockSomeKeys();
                        setupFullScreen();
                        disableRightClickContextMenu(canvas);

                        // Emscripten doesn't use the proper prefixed functions for fullscreen requests,
                        // so let's map the prefixed versions to the correct function.
                        canvas.requestPointerLock = getpointerlockenabler();

                        moveConfigToRoot(game_data.fs);

                        if (callbacks && callbacks.before_emulator) {
                            try {
                                callbacks.before_emulator();
                            } catch (x) {
                                console.log(x);
                            }
                        }

                        if ("runner" in game_data) {
                            if (game_data.runner == EmscriptenRunner || game_data.runner.prototype instanceof EmscriptenRunner) {
                                // this is a stupid hack. Emscripten-based
                                // apps currently need the runner to be set
                                // up first, then we can attach the
                                // script. The others have to do it the
                                // other way around.
                                runner = setup_runner();
                            }
                        }

                        if (game_data.emulatorJS) {
                            splash.setTitle("Launching Emulator");
                            return attach_script(game_data.emulatorJS);
                        } else {
                            splash.setTitle("Non-system disk or disk error");
                        }
                        return null;
                    },
                    function () {
                        if (!game_data || splash.failed_loading) {
                            return null;
                        }
                        splash.setTitle("Invalid media, track 0 bad or unusable");
                        splash.failed_loading = true;
                    })
                .then(function () {
                    if (!game_data || splash.failed_loading) {
                        return null;
                    }
                    if ("runner" in game_data) {
                        if (!runner) {
                            runner = setup_runner();
                        }
                        runner.start();
                        window.dispatchEvent(new Event('gameStarted'));
                    }
                });

            function setup_runner() {
                var runner = new game_data.runner(canvas, game_data);
                resizeCanvas(canvas, game_data.scale, game_data.nativeResolution, game_data.aspectRatio);
                runner.onStarted(function () {
                    splash.finished_loading = true;
                    splash.hide();
                    setTimeout(function() {
                            if (muted) {
                                runner.mute();
                            }
                            if (callbacks && callbacks.before_run) {
                                callbacks.before_run();
                            }
                        },
                        0);
                });
                runner.onReset(function () {
                    if (muted) {
                        runner.mute();
                    }
                });
                return runner;
            }

            return this;
        };
        this.start = start;

        var formatSize = function (event) {
            if (event.lengthComputable)
                return "("+ (event.total ? (event.loaded / event.total * 100).toFixed(0)
                        : "100") +
                    "%; "+ formatBytes(event.loaded) +
                    " of "+ formatBytes(event.total) +")";
            return "("+ formatBytes(event.loaded) +")";
        };

        var formatBytes = function (bytes, base10) {
            if (bytes === 0)
                return "0 B";
            var unit = base10 ? 1000 : 1024,
                units = base10 ? ["B", "kB","MB","GB","TB","PB","EB","ZB","YB"]
                    : ["B", "KiB","MiB","GiB","TiB","PiB","EiB","ZiB","YiB"],
                exp = parseInt((Math.log(bytes) / Math.log(unit))),
                size = bytes / Math.pow(unit, exp);
            return size.toFixed(1) +' '+ units[exp];
        };

        var fetch_file = function (title, url, rt, optional) {
            return _fetch_file(title, url, rt, optional, false);
        };

        var cached_file = function (title, data) {
            return _fetch_file(title, data, null, false, true);
        };

        var _fetch_file = function (title, url, rt, optional, cached) {
            var needsCSS = splash.table.dataset.hasCustomCSS == "false";
            var row = addRow(splash.table);
            var titleCell = row[0], statusCell = row[1];
            titleCell.textContent = title;
            return new Promise(function (resolve, reject) {
                if (cached) {
                    success();
                    resolve(url); // second parameter reused as a pass–through
                } else {
                    var xhr = new XMLHttpRequest();
                    xhr.open('GET', url, true);
                    xhr.responseType = rt || 'arraybuffer';
                    xhr.onprogress = function (e) {
                        titleCell.innerHTML = title +" <span style=\"font-size: smaller\">"+ formatSize(e) +"</span>";
                    };
                    xhr.onload = function (e) {
                        if (xhr.status === 200) {
                            success();
                            resolve(xhr.response);
                        } else if (optional) {
                            success();
                            resolve(null);
                        } else {
                            failure();
                            reject();
                        }
                    };
                    xhr.onerror = function (e) {
                        if (optional) {
                            success();
                            resolve(null);
                        } else {
                            failure();
                            reject();
                        }
                    };
                    xhr.send();
                }
            });
            function success() {
                statusCell.textContent = "✔";
                titleCell.parentNode.classList.add('emularity-download-success');
                titleCell.textContent = title;
                if (needsCSS) {
                    titleCell.style.fontWeight = 'bold';
                    titleCell.parentNode.style.backgroundColor = splash.getColor('foreground');
                    titleCell.parentNode.style.color = splash.getColor('background');
                }
            }
            function failure() {
                statusCell.textContent = "✘";
                titleCell.parentNode.classList.add('emularity-download-failure');
                titleCell.textContent = title;
                if (needsCSS) {
                    titleCell.style.fontWeight = 'bold';
                    titleCell.parentNode.style.backgroundColor = splash.getColor('failure');
                    titleCell.parentNode.style.color = splash.getColor('background');
                }
            }
        };

        function keyevent(resolve) {
            return function (e) {
                if (e.which == 32) {
                    e.preventDefault();
                    resolve();
                }
            };
        };

        var resizeCanvas = function (canvas, scale, resolution, aspectRatio) {
            if (scale && resolution) {
                // optimizeSpeed is the standardized value. different
                // browsers support different values; they will all ignore
                // values that they don't understand.
                canvas.style.imageRendering = '-moz-crisp-edges';
                canvas.style.imageRendering = '-o-crisp-edges';
                canvas.style.imageRendering = '-webkit-optimize-contrast';
                canvas.style.imageRendering = 'optimize-contrast';
                canvas.style.imageRendering = 'crisp-edges';
                canvas.style.imageRendering = 'pixelated';
                canvas.style.imageRendering = 'optimizeSpeed';

                canvas.style.width = resolution.width * scale +'px';
                canvas.style.height = resolution.height * scale +'px';
                canvas.setAttribute("width", resolution.width * scale);
                canvas.setAttribute("height", resolution.height * scale);
            }
        };

        var clearCanvas = function () {
            var context = canvas.getContext('2d');
            context.fillStyle = splash.getColor('background');
            context.fillRect(0, 0, canvas.width, canvas.height);
            console.log("canvas cleared");
        };

        function setupSplash(canvas, splash, globalOptions) {
            splash.splashElt = document.getElementById("emularity-splash-screen");
            if (!splash.splashElt) {
                splash.splashElt = document.createElement('div');
                splash.splashElt.classList.add("emularity-splash-screen");
                if (!globalOptions.hasCustomCSS) {
                    splash.splashElt.style.position = 'absolute';
                    splash.splashElt.style.top = '0';
                    splash.splashElt.style.left = '0';
                    splash.splashElt.style.right = '0';
                    splash.splashElt.style.color = splash.getColor('foreground');
                    splash.splashElt.style.backgroundColor = splash.getColor('background');
                }
                canvas.parentElement.appendChild(splash.splashElt);
            }

            splash.splashimg.classList.add("emularity-splash-image");
            if (!globalOptions.hasCustomCSS) {
                splash.splashimg.style.display = 'block';
                splash.splashimg.style.marginLeft = 'auto';
                splash.splashimg.style.marginRight = 'auto';
            }
            splash.splashElt.appendChild(splash.splashimg);

            splash.titleElt = document.createElement('span');
            splash.titleElt.classList.add("emularity-splash-title");
            if (!globalOptions.hasCustomCSS) {
                splash.titleElt.style.display = 'block';
                splash.titleElt.style.width = '100%';
                splash.titleElt.style.marginTop = "1em";
                splash.titleElt.style.marginBottom = "1em";
                splash.titleElt.style.textAlign = 'center';
                splash.titleElt.style.font = "24px sans-serif";
            }
            splash.titleElt.textContent = " ";
            splash.splashElt.appendChild(splash.titleElt);

            var table = document.getElementById("emularity-progress-indicator");
            if (!table) {
                table = document.createElement('table');
                table.classList.add("emularity-progress-indicator");
                table.dataset.hasCustomCSS = globalOptions.hasCustomCSS;
                if (!globalOptions.hasCustomCSS) {
                    table.style.width = "75%";
                    table.style.color = splash.getColor('foreground');
                    table.style.backgroundColor = splash.getColor('background');
                    table.style.marginLeft = 'auto';
                    table.style.marginRight = 'auto';
                    table.style.borderCollapse = 'separate';
                    table.style.borderSpacing = "2px";
                }
                splash.splashElt.appendChild(table);
            }
            splash.table = table;
        }

        splash.setTitle = function (title) {
            splash.titleElt.textContent = title;
        };

        splash.hide = function () {
            splash.splashElt.style.display = 'none';
        };

        splash.getColor = function (name) {
            return name in splash.colors ? splash.colors[name]
                : defaultSplashColors[name];
        };

        var addRow = function (table) {
            var needsCSS = table.dataset.hasCustomCSS == "false";
            var row = table.insertRow(-1);
            if (needsCSS) {
                row.style.textAlign = 'center';
            }
            var cell = row.insertCell(-1);
            if (needsCSS) {
                cell.style.position = 'relative';
            }
            var titleCell = document.createElement('span');
            titleCell.classList.add("emularity-download-title");
            titleCell.textContent = '—';
            if (needsCSS) {
                titleCell.style.verticalAlign = 'center';
                titleCell.style.minHeight = "24px";
                titleCell.style.whiteSpace = "nowrap";
            }
            cell.appendChild(titleCell);
            var statusCell = document.createElement('span');
            statusCell.classList.add("emularity-download-status");
            if (needsCSS) {
                statusCell.style.position = 'absolute';
                statusCell.style.left = "0";
                statusCell.style.paddingLeft = "0.5em";
            }
            cell.appendChild(statusCell);
            return [titleCell, statusCell];
        };

        var drawsplash = function () {
            canvas.setAttribute('moz-opaque', '');
            if (!splash.splashimg.src) {
                splash.splashimg.src = "/images/pdg_floppy.png";
            }
        };

        function attach_script(js_url) {
            return new Promise(function (resolve, reject) {
                var newScript;
                function loaded(e) {
                    if (e.target == newScript) {
                        newScript.removeEventListener("load", loaded);
                        newScript.removeEventListener("error", failed);
                        resolve();
                    }
                }
                function failed(e) {
                    if (e.target == newScript) {
                        newScript.removeEventListener("load", loaded);
                        newScript.removeEventListener("error", failed);
                        reject();
                    }
                }
                if (js_url) {
                    var head = document.getElementsByTagName('head')[0];
                    newScript = document.createElement('script');
                    newScript.addEventListener("load", loaded);
                    newScript.addEventListener("error", failed);
                    newScript.type = 'text/javascript';
                    newScript.src = js_url;
                    head.appendChild(newScript);
                }
            });
        }

        function getpointerlockenabler() {
            return canvas.requestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock;
        }

        this.isfullscreensupported = function () {
            return !!(getfullscreenenabler());
        };

        function setupFullScreen() {
            var self = this;
            var fullScreenChangeHandler = function() {
                if (!(document.mozFullScreenElement || document.fullScreenElement)) {
                    resizeCanvas(canvas, scale, css_resolution, aspectRatio);
                }
            };
            if ('onfullscreenchange' in document) {
                document.addEventListener('fullscreenchange', fullScreenChangeHandler);
            } else if ('onmozfullscreenchange' in document) {
                document.addEventListener('mozfullscreenchange', fullScreenChangeHandler);
            } else if ('onwebkitfullscreenchange' in document) {
                document.addEventListener('webkitfullscreenchange', fullScreenChangeHandler);
            }
        };

        this.requestFullScreen = function () {
            if (runner) {
                runner.requestFullScreen();
            }
        };

        /**
         * Prevents page navigation keys such as page up/page down from
         * moving the page while the user is playing.
         */
        function blockSomeKeys() {
            function keypress (e) {
                if (e.which >= 33 && e.which <= 40) {
                    e.preventDefault();
                    return false;
                }
                return true;
            }
            window.onkeydown = keypress;
        }

        /**
         * Disables the right click menu for the given element.
         */
        function disableRightClickContextMenu(element) {
            element.addEventListener('contextmenu',
                function (e) {
                    if (e.button == 2) {
                        // Block right-click menu thru preventing default action.
                        e.preventDefault();
                    }
                });
        }
    };

    /**
     * misc
     */
    function getfullscreenenabler() {
        return canvas.requestFullScreen || canvas.webkitRequestFullScreen || canvas.mozRequestFullScreen;
    }

    // This is such a hack. We're not calling the BrowserFS api
    // "correctly", so we have to synthesize these flags ourselves
    var flag_r = { isReadable: function() { return true; },
        isWriteable: function() { return false; },
        isTruncating: function() { return false; },
        isAppendable: function() { return false; },
        isSynchronous: function() { return false; },
        isExclusive: function() { return false; },
        pathExistsAction: function() { return 0; },
        pathNotExistsAction: function() { return 1; }
    };
    var flag_w = { isReadable: function() { return false; },
        isWriteable: function() { return true; },
        isTruncating: function() { return false; },
        isAppendable: function() { return false; },
        isSynchronous: function() { return false; },
        isExclusive: function() { return false; },
        pathExistsAction: function() { return 0; },
        pathNotExistsAction: function() { return 3; }
    };

    /**
     * Searches for dosbox.conf, and moves it to '/dosbox.conf' so dosbox uses it.
     */
    function moveConfigToRoot(fs) {
        var dosboxConfPath = null;
        // Recursively search for dosbox.conf.
        function searchDirectory(dirPath) {
            fs.readdirSync(dirPath).forEach(function(item) {
                if (dosboxConfPath) {
                    return;
                }
                // Avoid infinite recursion by ignoring these entries, which exist at
                // the root.
                if (item === '.' || item === '..') {
                    return;
                }
                // Append '/' between dirPath and the item's name... unless dirPath
                // already ends in it (which always occurs if dirPath is the root, '/').
                var itemPath = dirPath + (dirPath[dirPath.length - 1] !== '/' ? "/" : "") + item,
                    itemStat = fs.statSync(itemPath);
                if (itemStat.isDirectory(itemStat.mode)) {
                    searchDirectory(itemPath);
                } else if (item === 'dosbox.conf') {
                    dosboxConfPath = itemPath;
                }
            });
        }

        searchDirectory('/');

        if (dosboxConfPath !== null) {
            fs.writeFileSync('/dosbox.conf',
                fs.readFileSync(dosboxConfPath, null, flag_r),
                null, flag_w, 0x1a4);
        }
    };

    function extend(a, b) {
        if (a === null)
            return b;
        if (b === null)
            return a;
        var ta = typeof a,
            tb = typeof b;
        if (ta !== tb) {
            if (ta === 'undefined')
                return b;
            if (tb === 'undefined')
                return a;
            throw new Error("Cannot extend an "+ ta +" with an "+ tb);
        }
        if (Array.isArray(a))
            return a.concat(b);
        if (ta === 'object') {
            Object.keys(b).forEach(function (k) {
                a[k] = extend(k in a ? a[k] : undefined, b[k]);
            });
            return a;
        }
        return b;
    }

    function _SDL_CreateRGBSurfaceFrom(pixels, width, height, depth, pitch, rmask, gmask, bmask, amask) {
        // TODO: Actually fill pixel data to created surface.
        // TODO: Take into account depth and pitch parameters.
        // console.log('TODO: Partially unimplemented SDL_CreateRGBSurfaceFrom called!');
        var surface = SDL.makeSurface(width, height, 0, false, 'CreateRGBSurfaceFrom', rmask, gmask, bmask, amask);

        var surfaceData = SDL.surfaces[surface];
        var surfaceImageData = surfaceData.ctx.getImageData(0, 0, width, height);
        var surfacePixelData = surfaceImageData.data;

        // Fill pixel data to created surface.
        // Supports SDL_PIXELFORMAT_RGBA8888 and SDL_PIXELFORMAT_RGB888
        var channels = amask ? 4 : 3; // RGBA8888 or RGB888
        for (var pixelOffset = 0; pixelOffset < width*height; pixelOffset++) {
            surfacePixelData[pixelOffset*4+0] = HEAPU8[pixels + (pixelOffset*channels+0)]; // R
            surfacePixelData[pixelOffset*4+1] = HEAPU8[pixels + (pixelOffset*channels+1)]; // G
            surfacePixelData[pixelOffset*4+2] = HEAPU8[pixels + (pixelOffset*channels+2)]; // B
            surfacePixelData[pixelOffset*4+3] = amask ? HEAPU8[pixels + (pixelOffset*channels+3)] : 0xff; // A
        };

        surfaceData.ctx.putImageData(surfaceImageData, 0, 0);

        return surface;
    }

    window.DosBoxLoader = DosBoxLoader;
    window.Emulator = Emulator;
    window._SDL_CreateRGBSurfaceFrom = _SDL_CreateRGBSurfaceFrom;
})(typeof Promise === 'undefined' ? ES6Promise.Promise : Promise);

// Local Variables:
// js-indent-level: 2
// End:
