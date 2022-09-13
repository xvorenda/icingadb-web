/* Icinga DB Web | (c) 2020 Icinga GmbH | GPLv2 */

;(function(Icinga, $) {

    'use strict';

    const ANIMATION_LENGTH = 350;

    const POPUP_HTML = '<div class="icinga-module module-icingadb">\n' +
        '   <div id="migrate-popup">\n' +
        '       <div class="suggestion-area">\n' +
        '           <button type="button" class="close">Don\'t show this again</button>\n' +
        '           <ul class="search-migration-suggestions"></ul>\n' +
        '           <p class="search-migration-hint">Miss some results? Try the link(s) below</p>\n' +
        '           <ul class="monitoring-migration-suggestions"></ul>\n' +
        '           <p class="monitoring-migration-hint">Preview this in Icinga DB</p>\n' +
        '       </div>\n' +
        '       <div class="minimizer"><i class="icon-"></i></div>\n' +
        '    </div>\n' +
        '</div>';

    const SUGGESTION_HTML = '<li>\n' +
        '   <button type="button" value="1"></button>\n' +
        '   <button type="button" value="0"><i class="icon-"></i></button>\n' +
        '</li>';

    Icinga.Behaviors = Icinga.Behaviors || {};

    /**
     * Icinga DB Migration behavior.
     *
     * @param icinga {Icinga} The current Icinga Object
     */
    class Migrate extends Icinga.EventListener {
        constructor(icinga) {
            super(icinga);

            this.knownMigrations = {};
            this.knownBackendSupport = {};
            this.urlMigrationReadyState = null;
            this.backendSupportReadyState = null;
            this.searchMigrationReadyState = null;
            this.backendSupportRelated = {};
            this.$popup = null;

            // Some persistence, we don't want to annoy our users too much
            this.storage = Icinga.Storage.BehaviorStorage('icingadb.migrate');
            this.tempStorage = Icinga.Storage.BehaviorStorage('icingadb.migrate');
            this.tempStorage.setBackend(window.sessionStorage);
            this.previousMigrations = {};

            // We don't want to ask the server to migrate non-monitoring urls
            this.isMonitoringUrl = new RegExp('^' + icinga.config.baseUrl + '/monitoring/');

            this.on('rendered', this.onRendered, this);
            this.on('close-column', this.onColumnClose, this);
            this.on('click', '#migrate-popup button.close', this.onClose, this);
            this.on('click', '#migrate-popup li button', this.onDecision, this);
            this.on('click', '#migrate-popup .minimizer', this.onHandleClicked, this);
            this.storage.onChange('minimized', this.onMinimized, this);
        }

        update(data) {
            if (data !== 'bogus') {
                return;
            }

            $.each(this.backendSupportRelated, (id, _) => {
                let $container = $('#' + id);
                let req = this.icinga.loader.loadUrl($container.data('icingaUrl'), $container);
                req.addToHistory = false;
                req.scripted = true;
            });
        }

        onRendered(event) {
            var _this = event.data.self;
            var $target = $(event.target);

            if (_this.tempStorage.get('closed') || $('#layout.fullscreen-layout').length) {
                // Don't bother in case the user closed the popup or we're in fullscreen
                return;
            }

            if (!$target.is('#main > .container')) {
                if ($target.is('#main .container')) {
                    var attrUrl = $target.attr('data-icinga-url');
                    var dataUrl = $target.data('icingaUrl');
                    if (!! attrUrl && attrUrl !== dataUrl) {
                        // Search urls are redirected, update any migration suggestions
                        _this.prepareMigration($target);
                        return;
                    }
                }

                // We are else really only interested in top-level containers
                return;
            }

            var $dashboard = $target.children('.dashboard');
            if ($dashboard.length) {
                // After a page load dashlets have no id as `renderContentToContainer()` didn't ran yet
                _this.icinga.ui.assignUniqueContainerIds();

                $target = $dashboard.children('.container');
            }

            _this.prepareMigration($target);
        }

        prepareMigration($target) {
            let monitoringUrls = {};
            let searchUrls = {};
            let modules = {}

            $target.each((_, container) => {
                let $container = $(container);
                let href = decodeURI($container.data('icingaUrl'));
                let containerId = $container.attr('id');

                if (!!href) {
                    if (
                        typeof this.previousMigrations[containerId] !== 'undefined'
                        && this.previousMigrations[containerId] === href
                    ) {
                        delete this.previousMigrations[containerId];
                    } else {
                        if (href.match(this.isMonitoringUrl)) {
                            monitoringUrls[containerId] = href;
                        } else if ($container.find('[data-enrichment-type="search-bar"]').length) {
                            searchUrls[containerId] = href;
                        }
                    }
                }

                let moduleName = $container.data('icingaModule');
                if (!! moduleName && moduleName !== 'default' && moduleName !== 'monitoring' && moduleName !== 'icingadb') {
                    modules[containerId] = moduleName;
                }
            });

            if (Object.keys(monitoringUrls).length) {
                this.setUrlMigrationReadyState(false);
                this.migrateUrls(monitoringUrls, 'monitoring');
            } else {
                this.setUrlMigrationReadyState(null);
            }

            if (Object.keys(searchUrls).length) {
                this.setSearchMigrationReadyState(false);
                this.migrateUrls(searchUrls, 'search');
            } else {
                this.setSearchMigrationReadyState(null);
            }

            if (Object.keys(modules).length) {
                this.setBackendSupportReadyState(false);
                this.prepareBackendCheckboxForm(modules);
            } else {
                this.setBackendSupportReadyState(null);
            }

            if (
                this.urlMigrationReadyState === null
                && this.backendSupportReadyState === null
                && this.searchMigrationReadyState === null
            ) {
                this.cleanupPopup();
            }
        }

        onColumnClose(event) {
            var _this = event.data.self;
            _this.Popup().find('.suggestion-area > ul li').each(function () {
                var $suggestion = $(this);
                var suggestionUrl = $suggestion.data('containerUrl');
                var $container = $('#' + $suggestion.data('containerId'));

                var containerUrl = '';
                if ($container.length) {
                    containerUrl = decodeURI($container.data('icingaUrl'));
                }

                if (suggestionUrl !== containerUrl) {
                    var $newContainer = $('#main > .container').filter(function () {
                        return decodeURI($(this).data('icingaUrl')) === suggestionUrl;
                    });
                    if ($newContainer.length) {
                        // Container moved
                        $suggestion.attr('id', 'suggest-' + $newContainer.attr('id'));
                        $suggestion.data('containerId', $newContainer.attr('id'));
                    }
                }
            });

            let backendSupportRelated = { ..._this.backendSupportRelated };
            $.each(backendSupportRelated, (id, module) => {
                let $container = $('#' + id);
                if (! $container.length || $container.data('icingaModule') !== module) {
                    let $newContainer = $('#main > .container').filter(function () {
                        return $(this).data('icingaModule') === module;
                    });
                    if ($newContainer.length) {
                        _this.backendSupportRelated[$newContainer.attr('id')] = module;
                    }

                    delete _this.backendSupportRelated[id];
                }
            });

            _this.cleanupPopup();
        }

        onClose(event) {
            var _this = event.data.self;
            _this.tempStorage.set('closed', true);
            _this.hidePopup();
        }

        onDecision(event) {
            var _this = event.data.self;
            var $button = $(event.target).closest('button');
            var $suggestion = $button.parent();
            var $container = $('#' + $suggestion.data('containerId'));
            var containerUrl = decodeURI($container.data('icingaUrl'));

            if ($button.attr('value') === '1') {
                // Yes
                var newHref = _this.knownMigrations[containerUrl];
                _this.icinga.loader.loadUrl(newHref, $container);

                _this.previousMigrations[$suggestion.data('containerId')] = containerUrl;

                if ($container.parent().is('.dashboard')) {
                    $container.find('h1 a').attr('href', _this.icinga.utils.removeUrlParams(newHref, ['showCompact']));
                }
            } else {
                // No
                _this.knownMigrations[containerUrl] = false;
            }

            if (_this.Popup().find('li').length === 1 && ! _this.Popup().find('#setAsBackendForm').length) {
                _this.hidePopup(function () {
                    // Let the transition finish first, looks cleaner
                    $suggestion.remove();
                });
            } else {
                $suggestion.remove();
            }
        }

        onHandleClicked(event) {
            var _this = event.data.self;
            if (_this.togglePopup()) {
                _this.storage.set('minimized', true);
            } else {
                _this.storage.remove('minimized');
            }
        }

        onMinimized(isMinimized, oldValue) {
            if (isMinimized && isMinimized !== oldValue && this.isShown()) {
                this.minimizePopup();
            }
        }

        migrateUrls(urls, type) {
            var _this = this,
                containerIds = [],
                containerUrls = [];

            $.each(urls, function (containerId, containerUrl) {
                if (typeof _this.knownMigrations[containerUrl] === 'undefined') {
                    containerUrls.push(containerUrl);
                    containerIds.push(containerId);
                }
            });

            let endpoint, changeCallback;
            if (type === 'monitoring') {
                endpoint = 'monitoring-url';
                changeCallback = this.changeUrlMigrationReadyState.bind(this);
            } else {
                endpoint = 'search-url';
                changeCallback = this.changeSearchMigrationReadyState.bind(this);
            }

            if (containerUrls.length) {
                var req = $.ajax({
                    context: this,
                    type: 'post',
                    url: this.icinga.config.baseUrl + '/icingadb/migrate/' + endpoint,
                    headers: {'Accept': 'application/json'},
                    contentType: 'application/json',
                    data: JSON.stringify(containerUrls)
                });

                req.urls = urls;
                req.suggestionType = type;
                req.urlIndexToContainerId = containerIds;
                req.done(this.processUrlMigrationResults);
                req.always(() => changeCallback(true));
            } else {
                // All urls have already been migrated once, show popup immediately
                this.addSuggestions(urls, type);
                changeCallback(true);
            }
        }

        processUrlMigrationResults(data, textStatus, req) {
            var _this = this;
            var result, containerId;

            if (data.status === 'success') {
                result = data.data;
            } else {  // if (data.status === 'fail')
                result = data.data.result;

                $.each(data.data.errors, function (k, error) {
                    _this.icinga.logger.error('[Migrate] Erroneous url "' + k + '": ' + error[0] + '\n' + error[1]);
                });
            }

            $.each(result, function (i, migratedUrl) {
                containerId = req.urlIndexToContainerId[i];
                _this.knownMigrations[req.urls[containerId]] = migratedUrl;
            });

            this.addSuggestions(req.urls, req.suggestionType);
        }

        prepareBackendCheckboxForm(modules) {
            let containerIds = [];
            let moduleNames = [];

            $.each(modules, (id, module) => {
                if (typeof this.knownBackendSupport[module] === 'undefined') {
                    containerIds.push(id);
                    moduleNames.push(module);
                }
            });

            if (moduleNames.length) {
                let req = $.ajax({
                    context     : this,
                    type        : 'post',
                    url         : this.icinga.config.baseUrl + '/icingadb/migrate/backend-support',
                    headers     : { 'Accept': 'application/json' },
                    contentType : 'application/json',
                    data        : JSON.stringify(moduleNames)
                });

                req.modules = modules;
                req.moduleIndexToContainerId = containerIds;
                req.done(this.processBackendSupportResults);
                req.always(() => this.changeBackendSupportReadyState(true));
            } else {
                // All modules have already been checked once, show popup immediately
                this.setupBackendCheckboxForm(modules);
                this.changeBackendSupportReadyState(true);
            }
        }

        processBackendSupportResults(data, textStatus, req) {
            let result = data.data;

            $.each(result, (i, state) => {
                let containerId = req.moduleIndexToContainerId[i];
                this.knownBackendSupport[req.modules[containerId]] = state;
            });

            this.setupBackendCheckboxForm(req.modules);
        }

        setupBackendCheckboxForm(modules) {
            let supportedModules = {};

            $.each(modules, (id, module) => {
                if (this.knownBackendSupport[module]) {
                    supportedModules[id] = module;
                }
            });

            if (Object.keys(supportedModules).length) {
                this.backendSupportRelated = { ...this.backendSupportRelated, ...supportedModules };

                let req = $.ajax({
                    context : this,
                    type    : 'get',
                    url     : this.icinga.config.baseUrl + '/icingadb/migrate/checkbox-state?showCompact'
                });

                req.done(this.setCheckboxState);
            }
        }

        setCheckboxState(html, textStatus, req) {
            let $form = this.Popup().find('.suggestion-area > #setAsBackendForm');
            if (! $form.length) {
                $form = $(html);
                $form.attr('data-base-target', 'migrate-popup-backend-submit-blackhole');
                $form.append('<div id="migrate-popup-backend-submit-blackhole"></div>');

                this.Popup().find('.monitoring-migration-suggestions').before($form);
            } else {
                let $newForm = $(html);
                $form.find('[name=backend]').prop('checked', $newForm.find('[name=backend]').is(':checked'));
            }

            this.showPopup();
        }

        addSuggestions(urls, type) {
            var where;
            if (type === 'monitoring') {
                where = '.monitoring-migration-suggestions';
            } else {
                where = '.search-migration-suggestions';
            }

            var _this = this,
                hasSuggestions = false,
                $ul = this.Popup().find('.suggestion-area > ul' + where);
            $.each(urls, function (containerId, containerUrl) {
                // No urls for which the user clicked "No" or an error occurred and only migrated urls please
                if (_this.knownMigrations[containerUrl] !== false && _this.knownMigrations[containerUrl] !== containerUrl) {
                    var $container = $('#' + containerId);

                    var $suggestion = $ul.find('li#suggest-' + containerId);
                    if ($suggestion.length) {
                        if ($suggestion.data('containerUrl') === containerUrl) {
                            // There's already a suggestion for this exact container and url
                            hasSuggestions = true;
                            return;
                        }

                        $suggestion.data('containerUrl', containerUrl);
                    } else {
                        $suggestion = $(SUGGESTION_HTML);
                        $suggestion.attr('id', 'suggest-' + containerId);
                        $suggestion.data('containerId', containerId);
                        $suggestion.data('containerUrl', containerUrl);
                        $ul.append($suggestion);
                    }

                    hasSuggestions = true;

                    var title;
                    if ($container.data('icingaTitle')) {
                        title = $container.data('icingaTitle').split(' :: ').slice(0, -1).join(' :: ');
                    } else if ($container.parent().is('.dashboard')) {
                        title = $container.find('h1 a').text();
                    } else {
                        title = $container.find('.tabs li.active a').text();
                    }

                    $suggestion.find('button:first-of-type').text(title);
                }
            });

            if (hasSuggestions) {
                this.showPopup();
                if (type === 'search') {
                    this.maximizePopup();
                }
            }
        }

        cleanupSuggestions() {
            var _this = this,
                toBeRemoved = [];
            this.Popup().find('li').each(function () {
                var $suggestion = $(this);
                var $container = $('#' + $suggestion.data('containerId'));
                var containerUrl = decodeURI($container.data('icingaUrl'));
                if (
                    // Unknown url, yet
                    typeof _this.knownMigrations[containerUrl] === 'undefined'
                    // User doesn't want to migrate
                    || _this.knownMigrations[containerUrl] === false
                    // Already migrated or no migration necessary
                    || containerUrl === _this.knownMigrations[containerUrl]
                    // The container URL changed
                    || containerUrl !== $suggestion.data('containerUrl')
                ) {
                    toBeRemoved.push($suggestion);
                }
            });

            return toBeRemoved;
        }

        cleanupBackendForm() {
            let $form = this.Popup().find('#setAsBackendForm');
            if (! $form.length) {
                return false;
            }

            let stillRelated = {};
            $.each(this.backendSupportRelated, (id, module) => {
                let $container = $('#' + id);
                if ($container.length && $container.data('icingaModule') === module) {
                    stillRelated[id] = module;
                }
            });

            this.backendSupportRelated = stillRelated;

            if (Object.keys(stillRelated).length) {
                return true;
            }

            return $form;
        }

        cleanupPopup() {
            let toBeRemoved = this.cleanupSuggestions();
            let hasBackendForm = this.cleanupBackendForm();

            if (hasBackendForm !== true && this.Popup().find('li').length === toBeRemoved.length) {
                this.hidePopup(() => {
                    // Let the transition finish first, looks cleaner
                    $.each(toBeRemoved, function (_, $suggestion) {
                        $suggestion.remove();
                    });

                    if (typeof hasBackendForm === 'object') {
                        hasBackendForm.remove();
                    }
                });
            } else {
                $.each(toBeRemoved, function (_, $suggestion) {
                    $suggestion.remove();
                });

                if (typeof hasBackendForm === 'object') {
                    hasBackendForm.remove();
                }

                // Let showPopup() handle the automatic minimization in case all search suggestions have been removed
                this.showPopup();
            }
        }

        showPopup() {
            var $popup = this.Popup();
            if (this.storage.get('minimized') && ! this.forceFullyMaximized()) {
                if (this.isShown()) {
                    this.minimizePopup();
                } else {
                    $popup.addClass('active minimized hidden');
                }
            } else {
                $popup.addClass('active');
            }
        }

        hidePopup(after) {
            this.Popup().removeClass('active minimized hidden');

            if (typeof after === 'function') {
                setTimeout(after, ANIMATION_LENGTH);
            }
        }

        isShown() {
            return this.Popup().is('.active');
        }

        minimizePopup() {
            var $popup = this.Popup();
            $popup.addClass('minimized');
            setTimeout(function () {
                $popup.addClass('hidden');
            }, ANIMATION_LENGTH);
        }

        maximizePopup() {
            this.Popup().removeClass('minimized hidden');
        }

        forceFullyMaximized() {
            return this.Popup().find('.search-migration-suggestions:not(:empty)').length > 0;
        }

        togglePopup() {
            if (this.Popup().is('.minimized')) {
                this.maximizePopup();
                return false;
            } else {
                this.minimizePopup();
                return true;
            }
        }

        setUrlMigrationReadyState(state) {
            this.urlMigrationReadyState = state;
        }

        changeUrlMigrationReadyState(state) {
            this.setUrlMigrationReadyState(state);

            if (this.backendSupportReadyState !== false && this.searchMigrationReadyState !== false) {
                this.searchMigrationReadyState = null;
                this.backendSupportReadyState = null;
                this.urlMigrationReadyState = null;
                this.cleanupPopup();
            }
        }

        setSearchMigrationReadyState(state) {
            this.searchMigrationReadyState = state;
        }

        changeSearchMigrationReadyState(state) {
            this.setSearchMigrationReadyState(state);

            if (this.backendSupportReadyState !== false && this.urlMigrationReadyState !== false) {
                this.searchMigrationReadyState = null;
                this.backendSupportReadyState = null;
                this.urlMigrationReadyState = null;
                this.cleanupPopup();
            }
        }

        setBackendSupportReadyState(state) {
            this.backendSupportReadyState = state;
        }

        changeBackendSupportReadyState(state) {
            this.setBackendSupportReadyState(state);

            if (this.urlMigrationReadyState !== false && this.searchMigrationReadyState !== false) {
                this.searchMigrationReadyState = null;
                this.backendSupportReadyState = null;
                this.urlMigrationReadyState = null;
                this.cleanupPopup();
            }
        }

        Popup() {
            // Node.contains() is used due to `?renderLayout`
            if (this.$popup === null || ! document.body.contains(this.$popup[0])) {
                $('#layout').append($(POPUP_HTML));
                this.$popup = $('#migrate-popup');
            }

            return this.$popup;
        }
    }

    Icinga.Behaviors.Migrate = Migrate;

})(Icinga, jQuery);
