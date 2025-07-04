(function(scope, $) {
    var PUSH = Array.prototype.push;

    if (typeof lazy === 'undefined') lazy = function(a,b,c) { a[b] = c.call(a); }
    if (typeof delay === 'undefined') delay = function(a,b) { b() }
    if (typeof SoonFc === 'undefined') SoonFc = function(a,b) { return b }

    /**
     * Internal/private helper method for doing 'assert's.
     *
     * @param val {boolean}
     * @param msg {String}
     */
    var assert = function(val, msg) {
        if (!val) {
            throw new Error(msg ? msg : "Assertion Failed.");
        }
    };

    /**
     * DOM utilities
     *
     * @type {{}}
     */
    var DOMUtils = {};

    /**
     * Optimised/faster DOM node removal method
     *
     * @param node
     */
    DOMUtils.removeNode = function(node) {
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
        // else - parentNode is already removed.
    };

    /**
     * Helper for .appendAfter
     *
     * @param newElement
     * @param targetElement
     */
    DOMUtils.appendAfter = function(newElement, targetElement) {
        // target is what you want it to go after. Look for this elements parent.
        var parent = targetElement.parentNode;

        if (!parent) {
            // TODO: fix me properly...
            console.warn('The target element got detached from the DOM...', [targetElement]);
            return false;
        }

        // if the parents lastchild is the targetElement...
        if (parent.lastElementChild === targetElement) {
            // add the newElement after the target element.
            parent.appendChild(newElement);
        } else {
            // else the target has siblings, insert the new element between the target and it's next sibling.
            parent.insertBefore(newElement, targetElement.nextElementSibling);
        }
    };



    /**
     * Helper for .prepend
     *
     * @param newElement
     * @param targetElement
     */
    DOMUtils.prepend = function(newElement, targetElement) {
        if (targetElement.prepend) {
            targetElement.prepend(newElement)
        }
        else {
            if (targetElement.firstElementChild) {
                targetElement.insertBefore(newElement, targetElement.firstElementChild);
            }
            else {
                targetElement.appendChild(newElement);
            }
        }
    };




    var MEGALIST_DEFAULTS = {
        /**
         * Static, fixed width of the item when rendered (incl margin, padding, etc)
         */
        'itemWidth': false,

        /**
         * Static, fixed height of the item when rendered (incl margin, padding, etc)
         */
        'itemHeight': false,

        /**
         * Static, fixed height of the header if exist
         */
        'headerHeight': 0,

        /**
         * Static, fixed spacing height on bottom of wrapper for x-axis scroller to not overlap item on bottom end
         */
        'bottomSpacing': 0,

        /**
         * Oredered list of item IDs
         */
        'items': false,

        /**
         * A Callback function, that receives 1 argument - itemID (string/int) and should return a DOM Object, HTML
         * String or a jQuery object that is the actual DOM node to be rendered/appended to the list.
         */
        'itemRenderFunction': false,

        /**
         * A Callback function, that receives 1 argument - itemID (string/int) and should remove a node out of the DOM.
         * String or a jQuery object that is the actual DOM node to be rendered/appended to the list.
         */
        'itemRemoveFunction': false,

        /**
         * Optional jQuery/CSS selector of an object to be used for appending. Must be a child of the container.
         * Mainly used for hacking around table's markup and required DOM Tree where, the container would be marked as
         * scrollable area, but the tbody would be used for appending the items.
         */
        'appendTo': false,

        /**
         * If set to `true` MegaList would dynamically append, but never remove any nodes.
         * This is useful for browsers which have issues doing DOM ops and mess up the actual overall user experience
         * in sites using the MegaList for showing stuff, that later on would be cleared when the user changes the page
         * (e.g. file managers, when the user goes to a different folder, the DOM is cleared out).
         */
        'appendOnly': false,

        /**
         * Optional feature to insert items before/after their previous nodes, instead of always appending them
         * to the bottom of the container.
         *
         * Note: Can be overwritten by render adapters (e.g. Table)
         */
        'preserveOrderInDOM': false,

        /**
         * By default, the `MegaList.RENDER_ADAPTERS.PositionAbsolute` would be used.
         */
        'renderAdapter': false,

        /**
         * Pass any PerfectScrollbar options here.
         */
        'perfectScrollOptions': {},

        /**
         * Number of extra rows to show (even that they would be out of the viewport and hidden).
         * Note: MegaList would render number of `extraRows` before and also `extraRows` after the visible items,
         * except for the cases where the end of the list is reached or the list's scroll position is at top.
         */
        'extraRows': 0,

        /**
         * Number of extra # of "pages" (e.g. container/scroll height / itemHeight) to batch when rendering, instead of
         * always appending/removing one by one nodes while scrolling (main goal - to reduce FF FPS drops when
         * scrolling)
         */
        'batchPages': 0,

        /**
         * Internal option, that would be used by the Table renderer which would force the prepend to always be after
         * a specific (runtime defined) DOM element
         * @private
         */
        '_alwaysPrependAfter': false,

        /**
         * Force MegaList to trigger a 'onUserScroll' jQuery Event if needed.
         */
        'enableUserScrollEvent': false
    };

    /**
     * Helper variable, that create unique IDs by auto incrementing for every new MegaList that gets initialised.
     *
     * @type {number}
     */
    var listId = 0;

    /**
     * MegaList provides everything needed for efficient rendering of thousands of DOM nodes in a scrollable
     * (overflown) list or a grid.
     *
     * @param listContainer {String|jQuery|DOMNode} the container, which would be used to append list items
     * @param options {Object} see MEGALIST_DEFAULTS for defaults and available options.
     * @constructor
     */
    var MegaList = function (listContainer, options) {
        assert(options.itemRenderFunction, 'itemRenderFunction was not provided.');

        this.listId = listId++;

        this.$listContainer = $(listContainer);
        this.$listContainer
            .css({'position': 'relative'})
            .addClass("megaList");
        this.listContainer = this.$listContainer[0];

        var items = options.items;
        delete options.items;
        if (!items) {
            items = [];
        }
        this.items = items;

        this.options = $.extend({}, MEGALIST_DEFAULTS, options);

        if (this.options.appendTo) {
            this.$content = $(this.options.appendTo, this.$listContainer);
            this.content = this.$content[0];
        }

        this._wasRendered = false;
        this._isUserScroll = false;

        /**
         * A dynamic cache to be used as a width/height/numeric calculations
         *
         * @type {{}}
         * @private
         */
        this._calculated = false;

        /**
         * A map of IDs which are currently rendered (cached as a map, so that we can reduce access to the DOM)
         *
         * @type {Array}
         * @private
         */
        this._currentlyRendered = {};

        /** See {@link MegaList.throttledOnScroll} */
        this._throttledStage = 0;


        /**
         * Init the render adapter
         */
        if (!this.options.renderAdapter) {
            this.options.renderAdapter = new MegaList.RENDER_ADAPTERS.PositionAbsolute();
        }
        // pass a reference to MegaList, so that _calculated and other stuff can be used.
        this.options.renderAdapter.setMegaList(this);

        Object.defineProperty(this, 'removeNode', {
            value(n, h) {
                const {itemRemoveFunction} = this.options;
                return itemRemoveFunction && itemRemoveFunction(n, h) || DOMUtils.removeNode(n);
            }
        });
    };

    MegaList.prototype.updateOptions = function(options) {

        assert(options.itemRenderFunction, 'itemRenderFunction was not provided.');

        const prevPrePusher = this.options.renderAdapter.prePusherDOMNode;
        const prevPostPusher = this.options.renderAdapter.postPusherDOMNode;

        if (prevPrePusher) {
            prevPrePusher.remove();
            prevPostPusher.remove();
        }

        if (this.options.renderAdapter.spaceMaintainerCount) {
            options.renderAdapter.spaceMaintainerCount = this.options.renderAdapter.spaceMaintainerCount;
        }

        this.options = $.extend({}, MEGALIST_DEFAULTS, options);

        this._calculated = false;

        if (!this.options.renderAdapter) {
            this.options.renderAdapter = new MegaList.RENDER_ADAPTERS.PositionAbsolute();
        }

        this.options.renderAdapter.setMegaList(this);

        if (this.options.renderAdapter._willRender) {
            this.options.renderAdapter._willRender();
        }

        this.scrollToTop();
        this.resized();
    };

    /**
     * Internal method used for generating unique (per MegaList) instance namespace string. (not prepended with "."!)
     *
     * @returns {string}
     * @private
     */
    MegaList.prototype._generateEventNamespace = function() {
        return "megalist" + this.listId;
    };

    MegaList.prototype.throttledOnScroll = function(e) {
        // dump(`throttledOnScroll(${this._throttledStage})`);

        if (this._isUserScroll === true && !this._throttledStage++) {

            requestAnimationFrame(() => {
                if (this._isUserScroll === true && this.listContainer === e.target) {
                    if (this.options.enableUserScrollEvent) {
                        this.trigger('onUserScroll', e);
                    }
                    this._onScroll(e);
                }

                this._throttledStage = -1;
                // dump('throttledOnScroll()---END');
            });
        }
    };

    /**
     * Internal method that would be called when the MegaList renders to the DOM UI and is responsible for binding
     * the DOM events.
     *
     * @private
     */
    MegaList.prototype._bindEvents = function () {
        var self = this;
        var ns = self._generateEventNamespace();

        $(window).rebind("resize." + ns, SoonFc(40, self.resized.bind(self)));

        if (this.options.usingNativeScroll) {
            this.$listContainer.rebind('scroll.' + ns, self.throttledOnScroll.bind(self));
        }
        else {
            $(this.listContainer).rebind('ps-scroll-y.ps' + ns, self.throttledOnScroll.bind(self));
        }
    };

    /**
     * Called when .destroy is triggered. Should unbind any DOM events added by this MegaList instance.
     *
     * @private
     */
    MegaList.prototype._unbindEvents = function () {
        var ns = this._generateEventNamespace();

        $(window).off("resize." + ns);

        if (this.options.usingNativeScroll) {
            this.$listContainer.off('scroll.' + ns);
        }
        else {
            $(this.listContainer).off('ps-scroll-y.ps' + ns);
        }
    };

    /**
     * Add an item to the list.
     *
     * @param itemId {String}
     */
    MegaList.prototype.add = function (itemId) {
        this.batchAdd([itemId]);
    };

    /**
     * Remove and item from the list.
     *
     * @param itemId {String}
     */
    MegaList.prototype.remove = function (itemId) {
        this.batchRemove([itemId]);
    };

    /**
     * Optimised adding of entries, less DOM updates
     *
     * @param itemIdsArray {Array} Array of item IDs (Strings)
     */
    MegaList.prototype.batchAdd = function(itemIdsArray) {
        PUSH.apply(this.items, itemIdsArray);

        if (this._wasRendered) {
            this._contentUpdated();
            this._applyDOMChanges(true);
        }
    };

    /**
     * Optimised replacing of entries, less DOM updates
     *
     * @param items {Array} Array of item IDs (Strings)
     */
    MegaList.prototype.batchReplace = function(items) {
        this.items = items;

        if (this._wasRendered) {
            this._contentUpdated();
            this._applyDOMChanges(true);
        }
    };

    /**
     * Optimised removing of entries, less DOM updates
     *
     * @param itemIdsArray {Array} Array of item IDs (Strings)
     */
    MegaList.prototype.batchRemove = function(itemIdsArray) {
        var self = this;
        var requiresRerender = false;
        var itemsWereModified = false;

        itemIdsArray.forEach(function(itemId) {
            var itemIndex = self.items.indexOf(itemId);
            if (itemIndex > -1) {
                if (self.isRendered(itemId)) {
                    requiresRerender = true;
                    self.removeNode(self._currentlyRendered[itemId], itemId);
                    delete self._currentlyRendered[itemId];
                }
                self.items.splice(itemIndex, 1);
                itemsWereModified = true;
            }
        });

        if (itemsWereModified) {
            if (this._wasRendered) {
                this._contentUpdated();
            }

            if (requiresRerender) {
                this._repositionRenderedItems();
                this._applyDOMChanges(true);

            }
        }
    };

    /**
     * Checks if an item exists in the list.
     *
     * @param itemId {String}
     * @returns {boolean}
     */
    MegaList.prototype.has = function (itemId) {
        return this.items.indexOf(itemId) > -1;
    };

    /**
     * Checks if an item is currently rendered.
     *
     * @param itemId {String}
     * @returns {boolean}
     */
    MegaList.prototype.isRendered = function (itemId) {
        const n = this._currentlyRendered[itemId];

        if (n) {
            if (n.parentNode) {
                return true;
            }

            if (d) {
                console.warn(`MegaList: Found stale rendered node for "${itemId}"`, n);
            }
            delete this._currentlyRendered[itemId];
        }
        return false;
    };

    /**
     * Should be called when the list container is resized.
     * This method would be automatically called on window resize, so no need to do that in the implementing code.
     */
    MegaList.prototype.resized = function () {

        if (!this._wasRendered) {
            return;
        }
        this._calculated = false;
        this._contentUpdated(true);
        this._applyDOMChanges();

        // destroy PS if ALL items are visible
        if (
            this._calculated['visibleFirstItemNum'] === 0 &&
            this._calculated['visibleLastItemNum'] === this.items.length &&
            this._calculated['contentWidth'] <= this._calculated['scrollWidth'] &&
            this._calculated['contentHeight'] <= this._calculated['scrollHeight']
        ) {
            if (this._scrollIsInitialized === true) {
                this._scrollIsInitialized = false;
                if (!this.options.usingNativeScroll) {
                    Ps.destroy(this.listContainer);
                }
            }
        }
        else {
            // not all items are visible after a resize, should we init PS?
            if (this._scrollIsInitialized === false) {
                if (!this.options.usingNativeScroll) {
                    Ps.initialize(this.listContainer, this.options.perfectScrollOptions);
                }
                this._scrollIsInitialized = true;
            }
            else {
                Ps.update(this.listContainer, this.options.perfectScrollOptions);
            }
        }
    };


    /**
     * Same as jQuery(megaListInstance).bind('eventName', cb);
     *
     * @param eventName {String}
     * @param cb {Function}
     */
    MegaList.prototype.bind = function (eventName, cb) {
        $(this).on(eventName, cb);
    };

    /**
     * Same as jQuery(megaListInstance).unbind('eventName', cb) and then .bind('eventName', cb);
     *
     * @param eventName {String}
     * @param cb {Function}
     */
    MegaList.prototype.rebind = function (eventName, cb) {
        if (eventName.indexOf(".") === -1) {
            if (typeof console !== 'undefined' && console.error) {
                console.error("MegaList.rebind called with eventName that does not have a namespace, which is an" +
                    "anti-pattern");
            }
            return;
        }
        $(this).rebind(eventName, cb);
    };

    /**
     * Same as jQuery(megaListInstance).unbind('eventName', cb);
     * @param eventName {String}
     * @param cb {Function}
     */
    MegaList.prototype.unbind = function (eventName, cb) {
        $(this).unbind(eventName, cb);
    };

    /**
     * Same as jQuery(megaListInstance).trigger(...);
     */
    MegaList.prototype.trigger = function () {
        if (!this.$megaList) {
            this.$megaList = $(this);
        }
        this.$megaList.trigger.apply(this.$megaList, arguments);
    };


    /**
     * Force update the scrollable area.
     */
    MegaList.prototype.scrollUpdate = function() {
        if (this._scrollIsInitialized && !this.options.usingNativeScroll) {
            Ps.update(this.listContainer);
        }
    };

    /**
     * Scroll the scrollable area to a specific `posTop` or `posLeft`.
     * Passing undefined to `posTop` can be used to only scroll the area via `posLeft`
     *
     * @param posTop {Number|undefined}
     * @param [posLeft] {Number|undefined}
     */
    MegaList.prototype.scrollTo = function(posTop, posLeft) {
        this._calculated = false;

        if (typeof posTop !== 'undefined') {
            this.listContainer.scrollTop = posTop;
        }
        if (typeof posLeft !== 'undefined') {
            this.listContainer.scrollLeft = posLeft;
        }
        this.scrollUpdate();
        this._repositionRenderedItems();
        this._applyDOMChanges();
    };

    /**
     * Returns the current top position of the scrollable area
     *
     * @returns {number|*|Number|undefined}
     */
    MegaList.prototype.getScrollTop = function() {
        return this.listContainer.scrollTop;
    };

    /**
     * Returns the current left position of the scrollable area
     *
     * @returns {Number}
     */
    MegaList.prototype.getScrollLeft = function() {
        return this.listContainer.scrollLeft;
    };

    /**
     * Returns the scroll's height
     *
     * @returns {Number}
     */
    MegaList.prototype.getScrollHeight = function() {
        this._recalculate();
        return this._calculated['scrollHeight'];
    };

    /**
     * Returns the scroll's width
     *
     * @returns {Number}
     */
    MegaList.prototype.getScrollWidth = function() {
        this._recalculate();
        return this._calculated['scrollWidth'];
    };

    /**
     * Returns the total height of the list (incl. the overflown/not visible part).
     *
     * @returns {Number}
     */
    MegaList.prototype.getContentHeight = function() {
        this._recalculate();
        return this._calculated['contentHeight'];
    };

    /**
     * Returns the total width of the list (incl. the overflown/not visible part).
     * @returns {Number}
     */
    MegaList.prototype.getContentWidth = function() {
        this._recalculate();
        return this._calculated['contentWidth'];
    };

    /**
     * Returns true if the scrollable area is scrolled to top.
     *
     * @returns {boolean}
     */
    MegaList.prototype.isAtTop = function() {
        this._recalculate();
        return this._calculated['isAtTop'];
    };

    /**
     * Returns true if the scrollable area is scrolled to bottom.
     *
     * @returns {boolean}
     */
    MegaList.prototype.isAtBottom = function() {
        this._recalculate();
        return this._calculated['isAtBottom'];
    };

    /**
     * Returns a percent, representing the scroll position X.
     *
     * @returns {Number}
     */
    MegaList.prototype.getScrolledPercentX = function() {
        this._recalculate();
        return this._calculated['scrolledPercentX'];
    };

    /**
     * Returns a percent, representing the scroll position Y.
     *
     * @returns {*}
     */
    MegaList.prototype.getScrolledPercentY = function() {
        this._recalculate();
        return this._calculated['scrolledPercentY'];
    };

    /**
     * Scroll the Y axis of the list to `posPerc`
     *
     * @param posPerc {Number} A percent in the format of 0.0 - 1.0
     */
    MegaList.prototype.scrollToPercentY = function(posPerc) {
        var targetPx = this.getContentHeight() * posPerc;
        if (this.listContainer.scrollTop !== targetPx) {
            this.listContainer.scrollTop = targetPx;
            this._isUserScroll = false;
            this.scrollUpdate();
            this._onScroll();
            this._isUserScroll = true;
        }
    };

    /**
     * Scroll to specific Y position.
     *
     * @param posY {Number}
     */
    MegaList.prototype.scrollToY = function(posY) {
        if (this.listContainer.scrollTop !== posY) {
            this.listContainer.scrollTop = posY;
            this._isUserScroll = false;
            this.scrollUpdate();
            this._onScroll();
            this._isUserScroll = true;
        }
    };

    /**
     * Scroll to specific DOM Node.
     * Warning: The DOM Node should be a child of the listContainer, otherwise you may notice weird behaviour of this
     * function.
     *
     * @param element {DOMNode}
     */
    MegaList.prototype.scrollToDomElement = function(element) {

        if (!this._elementIsInViewport(element)) {
            this.listContainer.scrollTop = $(element)[0].offsetTop;
            this._isUserScroll = false;
            this.scrollUpdate();
            this._onScroll();
            this._isUserScroll = true;
        }
    };

    /**
     * Scroll to specific `itemId`
     *
     * @param itemId {String}
     * @returns {boolean} true if found, false if not found.
     */
    MegaList.prototype.scrollToItem = function(itemId) {
        var elementIndex = this.items.indexOf(itemId);
        if (elementIndex === -1) {
            return false;
        }

        var scrollToY = -1;
        var itemOffsetTop = Math.floor(elementIndex / this._calculated['itemsPerRow']) * this.options.itemHeight;
        var itemOffsetTopPlusHeight = itemOffsetTop + this.options.itemHeight;

        // check if the item is above the visible viewport
        if (itemOffsetTop < this._calculated['scrollTop']) {
            scrollToY = itemOffsetTop;
        }
        // check if the item is below the visible viewport
        else if (itemOffsetTopPlusHeight + this.options.headerHeight >
            (this._calculated['scrollTop'] + this._calculated['scrollHeight'])) {
            scrollToY = itemOffsetTopPlusHeight - this._calculated['scrollHeight'] +
                this.options.headerHeight + this.options.bottomSpacing;
        }

        // have to scroll
        if (scrollToY !== -1) {
            this.listContainer.scrollTop = scrollToY;
            this._isUserScroll = false;
            this.scrollUpdate();
            this._onScroll();
            this._isUserScroll = true;

            return true;
        }
        else {
            return false;
        }
    };


    /**
     * Alias to .scrollTo(0, 0)
     */
    MegaList.prototype.scrollToTop = function() {
        this.scrollTo(0, 0);
    };

    /**
     * Alias to .scrollToPercentY(1)
     */
    MegaList.prototype.scrollToBottom = function() {
        this.scrollToPercentY(1);
    };


    /**
     * Alias to .scrollTo(0, 0)
     */
    MegaList.prototype.scrollPageUp = function() {
        var top = this._calculated['scrollTop'];
        top -= this._calculated['scrollHeight'];
        if (top >= 0) {
            this.scrollTo(top);
        }
        else {
            this.scrollTo(0);
        }
    };

    /**
     * Alias to .scrollToPercentY(1)
     */
    MegaList.prototype.scrollPageDown = function() {
        var top = this._calculated['scrollTop'];
        top += this._calculated['scrollHeight'];
        if (top <= this._calculated['contentHeight'] - this._calculated['scrollHeight']) {
            this.scrollTo(top);
        }
        else {
            this.scrollTo(this._calculated['contentHeight'] - this._calculated['scrollHeight']);
        }
    };

    /**
     * Used in case you want to destroy the MegaList instance and its created DOM nodes
     */
    MegaList.prototype.destroy = function () {
        // destroy PS
        this._unbindEvents();

        this.items = [];
        this._wasRendered = false;

        if(!this.options.usingNativeScroll) {
            Ps.destroy(this.listContainer);
        }

        if (!this.options.appendTo && this.content) {
            DOMUtils.removeNode(this.content);
            this.$content = this.content = undefined;
        }
    };


    /**
     * Often you may want to initialise the MegaList, but not render it immediately (e.g. some items are still loading
     * and waiting to be added to the MegaList). Thats why, this method should be called so that the initial rendering
     * of the internal DOM nodes is done.
     */
    MegaList.prototype.initialRender = function () {
        assert(this._wasRendered === false, 'This MegaList is already rendered');


        if (!this.$content) {
            this.$content = $('<div class="megaList-content"></div>');
            this.$content.css({
                'position': 'relative'
            });
            this.content = this.$content[0];

            this.listContainer.appendChild(this.content);
        }

        if (!this.options.usingNativeScroll) {
            // init PS
            Ps.initialize(this.listContainer, this.options.perfectScrollOptions);
        }

        this._scrollIsInitialized = true;

        this._contentUpdated();

        if (this.options.renderAdapter._willRender) {
            this.options.renderAdapter._willRender();
        }
        this._wasRendered = true;

        this._applyDOMChanges();

        this.scrollUpdate();

        this._isUserScroll = true;

        // bind events
        this._bindEvents();

        if (this.options.renderAdapter._rendered) {
            this.options.renderAdapter._rendered();
        }
    };


    /**
     * Does recalculation of the internally precalculated values so that the DOM Re-paints are reduced to minimum,
     * while the user is scrolling up/down.
     * @private
     */
    MegaList.prototype._recalculate = function() {
        if (this._calculated) {
            return this._calculated;
        }
        var self = this;
        var calculated = this._calculated = Object.create(null);

        lazy(calculated, 'scrollWidth', function() {
            return self.$listContainer.innerWidth();
        });

        lazy(calculated, 'scrollHeight', function() {
            return self.$listContainer.innerHeight();
        });

        lazy(calculated, 'itemWidth', function() {
            if (self.options.itemWidth === false) {
                return this.contentWidth;
            }
            else if (typeof self.options.itemWidth === 'function') {
                return self.options.itemWidth();
            }
            return self.options.itemWidth;
        });

        lazy(calculated, 'contentWidth', function() {
            var contentWidth = self.$listContainer.children(":first").outerWidth();
            if (contentWidth) {
                return contentWidth;
            }
            return this.scrollWidth;
        });

        lazy(calculated, 'itemsPerRow', function() {
            return Math.max(1, Math.floor(this.contentWidth / this.itemWidth));
        });

        lazy(calculated, 'itemsPerPage', function() {
            return Math.ceil(this.scrollHeight / self.options.itemHeight) * this.itemsPerRow;
        });

        lazy(calculated, 'contentHeight', function() {
            return Math.ceil(self.items.length / this.itemsPerRow) * self.options.itemHeight +
                self.options.headerHeight + self.options.bottomSpacing;
        });

        lazy(calculated, 'scrollLeft', function() {
            return self.listContainer.scrollLeft;
        });
        lazy(calculated, 'scrollTop', function() {
            return self.listContainer.scrollTop;
        });
        lazy(calculated, 'scrolledPercentX', function() {
            return 100 / this.scrollWidth * this.scrollLeft;
        });
        lazy(calculated, 'scrolledPercentY', function() {
            return 100 / this.scrollHeight * this.scrollTop;
        });
        lazy(calculated, 'isAtTop', function() {
            return this.scrollTop === 0;
        });
        lazy(calculated, 'isAtBottom', function() {
            return self.listContainer.scrollTop === this.contentHeight - this.scrollHeight;
        });

        lazy(calculated, 'visibleFirstItemNum', function() {
            var value = 0;

            if (self.options.appendOnly !== true) {
                value = Math.floor(Math.floor(this.scrollTop / self.options.itemHeight) * this.itemsPerRow);

                if (value > 0) {
                    value = Math.max(0, value - (self.options.extraRows * this.itemsPerRow));
                }
            }

            return value;
        });

        lazy(calculated, 'visibleLastItemNum', function() {
            var value = Math.min(
                self.items.length,
                Math.ceil(
                    Math.ceil(this.scrollTop / self.options.itemHeight) *
                    this.itemsPerRow + this.itemsPerPage
                )
            );

            if (value < self.items.length) {
                value = Math.min(self.items.length, value + (self.options.extraRows * this.itemsPerRow));
            }

            return value;
        });

        if (this.options.batchPages > 0) {
            var perPage = calculated['itemsPerPage'];

            var visibleF = calculated['visibleFirstItemNum'];
            calculated['visibleFirstItemNum'] = Math.max(
                0,
                ((((visibleF - visibleF % perPage) / perPage) - 1) - this.options.batchPages) * perPage
            );

            var visibleL = calculated['visibleLastItemNum'];
            calculated['visibleLastItemNum'] = Math.min(
                this.items.length,
                ((((visibleL - visibleL % perPage) / perPage) + 1) + this.options.batchPages) * perPage
            );
        }

        return calculated;
    };

    /**
     * Internal method, that gets called when the MegaList's content gets updated (e.g. the internal list of item ids).
     *
     * @private
     */
    MegaList.prototype._contentUpdated = function(forced) {
        if (this._wasRendered || forced) {
            this._calculated = false;
            this._recalculate();

            if (this._lastContentHeight !== this._calculated['contentHeight']) {
                this._lastContentHeight = this._calculated['contentHeight'];
                this.content.style.height = this._calculated.contentHeight -
                    this.options.headerHeight - this.options.bottomSpacing + "px";
            }

            // scrolled out of the viewport if the last item in the list was removed? scroll back a little bit...
            if (this._calculated['scrollHeight'] + this._calculated['scrollTop'] > this._calculated['contentHeight']) {
                this.scrollToBottom();
            }
        }
    };

    /**
     * Internal method, that get called when DOM changes should be done (e.g. render new items since they got in/out
     * of the viewport)
     *
     * @var {bool} [contentWasUpdated] pass true to force dimension related updates
     * @private
     */
    MegaList.prototype._applyDOMChanges = function(contentWasUpdated) {
        this._recalculate();

        var first = this._calculated['visibleFirstItemNum'];
        var last = this._calculated['visibleLastItemNum'];

        // remove items before the first visible item
        if (this.options.appendOnly !== true) {
            for (var i = 0; i < first; i++) {
                var id = this.items[i];
                if (this._currentlyRendered[id]) {
                    contentWasUpdated = true;
                    this.removeNode(this._currentlyRendered[id], id);
                    delete this._currentlyRendered[id];
                }
            }

            // remove items after the last visible item
            for (var i = last; i < this.items.length; i++) {
                var id = this.items[i];
                if (this._currentlyRendered[id]) {
                    contentWasUpdated = true;
                    this.removeNode(this._currentlyRendered[id], id);
                    delete this._currentlyRendered[id];
                }
            }
        }

        var prependFragment = document.createDocumentFragment();
        var appendFragment = document.createDocumentFragment();
        var appendAfterID;

        // show items which are currently visible
        for(var i = first; i < last; i++) {
            var id = this.items[i];

            if (!this.isRendered(id)) {
                var renderedNode = this.options.itemRenderFunction(id);
                if (!renderedNode) {
                    console.warn('MegaList: Node not found...', id);
                    continue;
                }

                contentWasUpdated = true;
                if (this.options.renderAdapter._repositionRenderedItem) {
                    this.options.renderAdapter._repositionRenderedItem(id, renderedNode);
                }

                if (!this.options.preserveOrderInDOM) {
                    appendFragment.appendChild(renderedNode);
                }
                else {
                    if (i === 0) {
                        DOMUtils.prepend(renderedNode, prependFragment);
                    }
                    else {
                        var previousNodeId = this.items[i - 1];
                        if (this._currentlyRendered[previousNodeId]) {
                            DOMUtils.appendAfter(renderedNode, this._currentlyRendered[previousNodeId]);
                        }
                        else {
                            appendAfterID = appendAfterID || previousNodeId;
                            appendFragment.appendChild(renderedNode);
                        }
                    }
                }

                this._currentlyRendered[id] = renderedNode;
            }
            else {
                if (this.options.renderAdapter._repositionRenderedItem) {
                    this.options.renderAdapter._repositionRenderedItem(id);
                }
            }
        }

        if (prependFragment.childNodes.length) {
            if (this.options._alwaysPrependAfter) {
                DOMUtils.appendAfter(prependFragment, this.options._alwaysPrependAfter);
            }
            else {
                DOMUtils.prepend(prependFragment, this.content);
            }
        }
        if (appendFragment.childNodes.length) {
            if (this._currentlyRendered[appendAfterID]) {
                DOMUtils.appendAfter(appendFragment, this._currentlyRendered[appendAfterID]);
            }
            else if (this.options._alwaysPrependAfter) {
                DOMUtils.appendAfter(appendFragment, this.options._alwaysPrependAfter);
            }
            else {
                this.content.appendChild(appendFragment);
            }
        }

        if (contentWasUpdated === true) {
            if (this.options.renderAdapter._itemsRepositioned) {
                this.options.renderAdapter._itemsRepositioned();
            }

            const tick = 192;
            delay(`megalist:content-updated:${this.listId}`, () => {
                this._isUserScroll = false;
                this.scrollUpdate();
                this._isUserScroll = true;

                if (this.options.onContentUpdated) {
                    delay(`megalist:content-updated:feedback:${this.listId}`, this.options.onContentUpdated, tick << 1);
                }
            }, tick);
        }
    };

    /**
     * Internal method that *ONLY* repositions items, in case a call to `_applyDOMChanges` is NOT needed, but the
     * items in the list should be re-positioned.
     * Basically, a lightweight version of `_applyDOMChanges` that does NOT adds or removes DOM nodes.
     *
     * @private
     */
    MegaList.prototype._repositionRenderedItems = function() {
        var self = this;
        if (self.options.renderAdapter._repositionRenderedItem) {
            Object.keys(self._currentlyRendered).forEach(function (k) {
                self.options.renderAdapter._repositionRenderedItem(k);
            });
        }

        if (this.options.renderAdapter._itemsRepositioned) {
            this.options.renderAdapter._itemsRepositioned();
        }
    };

    /**
     * Internal method that gets called when the user scrolls.
     *
     * @param e {Event}
     * @private
     */
    MegaList.prototype._onScroll = function(e) {
        this._calculated = false;
        this._applyDOMChanges();
    };

    /**
     * Not-so efficient method of maintaining item ids in sync with your data source, but helpful enough for
     * quick prototypes or UIs which don't update their item lists too often.
     * Would update the internally stored item ids, with the idsArray.
     * Would take care of appending/prepending/positioning newly rendered elements in the UI properly with minimum DOM
     * updates.
     *
     * @param idsArray
     */
    MegaList.prototype.syncItemsFromArray = function(idsArray) {
        var self = this;
        var r = array.diff(this.items, idsArray);

        // IF initially the folder was empty, megaList may not had been rendered...so, lets check
        var requiresRerender = false;

        r.removed.forEach(function (itemId) {
            var itemIndex = self.items.indexOf(itemId);
            if (itemIndex > -1) {
                if (self.isRendered(itemId)) {
                    requiresRerender = true;
                    self.removeNode(self._currentlyRendered[itemId], itemId);
                    delete self._currentlyRendered[itemId];
                }
                self.items.splice(itemIndex, 1);
            }
        });

        r.added.forEach(function(itemId) {
            var itemIndex = self.items.indexOf(itemId);
            if (itemIndex === -1) {
                // XX: Can be made more optimal, e.g. to only rerender if prev/next was updated
                requiresRerender = true;

                var targetIndex = idsArray.indexOf(itemId);

                assert(targetIndex !== -1, 'targetIndex was -1, this should never happen.');

                if (targetIndex === 0) {
                    self.items.unshift(itemId);
                }
                else {
                    self.items.splice(targetIndex, 0, itemId);
                }
            }
        });

        if (this._wasRendered) {
            this._contentUpdated();
        }
        else {
            this.initialRender();
        }

        if (requiresRerender) {
            this._repositionRenderedItems();
            this._applyDOMChanges();

        }
    };

    /**
     * Utility function for reposition updated node to specific position, more optimal for single node is updated case
     *
     * @param id {{string}} id of item in the list which updated to trigger reposition
     * @param to {{int}} index of target position where item is moved to
     */

    // @TODO: currently using reposition item and then remove domnode to make it re-render again.
    // Need to find better way reposition existing item rather then re-create node after delete it.
    MegaList.prototype.repositionItem = function(id, to) {

        this.items.splice(to, 0, this.items.splice(this.items.indexOf(id), 1)[0]);

        if (this._currentlyRendered[id]) {
            this.removeNode(this._currentlyRendered[id], id)
        }

        this._contentUpdated();
        this._repositionRenderedItems();
        this._applyDOMChanges();
    }

    /**
     * Utility function for batch adding of new nodes on *specific* positions in the items list
     *
     * @param idsObj {{int,string}} a hash map with keys = position for the item to be added, string = item id
     */
    MegaList.prototype.batchAddFromMap = function(idsObj) {
        var self = this;

        // IF initially the folder was empty, megaList may not had been rendered...so, lets check
        var requiresRerender = false;

        Object.keys(idsObj).forEach(function(targetIndex) {
            var itemId = idsObj[targetIndex];

            var itemIndex = self.items.indexOf(itemId);
            if (itemIndex === -1) {
                // XX: Can be made more optimal, e.g. to only rerender if prev/next was updated
                requiresRerender = true;

                if (targetIndex === 0) {
                    self.items.unshift(itemId);
                    // console.error('1unshift', itemId);
                }
                else {
                    self.items.splice(targetIndex, 0, itemId);
                    // console.error('1splice', targetIndex, itemId);
                }
            }
            else if (itemIndex !== targetIndex) {
                requiresRerender = true;
                // delete item from the array
                // console.error('2remove', itemIndex);
                self.items.splice(itemIndex, 1);
                // add it back to the new target position
                // console.error('2add', targetIndex);
                self.items.splice(targetIndex, 0, itemId);
            }
        });

        if (this._wasRendered) {
            this._contentUpdated();
        }
        else {
            this.initialRender();
        }

        if (requiresRerender) {
            this._repositionRenderedItems();
            this._applyDOMChanges();

        }
    };

    /**
     * Basic util method to check if an element is in the visible viewport
     *
     * @param el {DOMNode|jQuery}
     * @returns {boolean}
     * @private
     */
    MegaList.prototype._elementIsInViewport = function isElementInViewport (el) {

        // refactored from:
        // http://stackoverflow.com/questions/123999/how-to-tell-if-a-dom-element-is-visible-in-the-current-viewport/

        if (typeof jQuery === "function" && el instanceof jQuery) {
            el = el[0];
        }

        var rect     = el.getBoundingClientRect(),
            vWidth   = window.innerWidth || doc.documentElement.clientWidth,
            vHeight  = window.innerHeight || doc.documentElement.clientHeight,
            efp      = function (x, y) { return document.elementFromPoint(x, y) };

        return rect.bottom > 0 &&
            rect.right > 0 &&
            rect.left < (window.innerWidth || document.documentElement.clientWidth) /* or $(window).width() */ &&
            rect.top < (window.innerHeight || document.documentElement.clientHeight) /* or $(window).height() */;
    };

    MegaList.RENDER_ADAPTERS = {};

    MegaList.RENDER_ADAPTERS.PositionAbsolute = class PositionAbsoluteRenderAdapter {

        constructor(options) {

            this.options = options || {};
        }

        setMegaList(megaList) {

            this.megaList = megaList;
        }

        _repositionRenderedItem(itemId, node) {

            assert(this.megaList, 'megaList is not set.');

            const megaList = this.megaList;
            if (!node) {
                node = megaList._currentlyRendered[itemId];
                if (!node) {
                    return;
                }
            }
            const itemPos = megaList.items.indexOf(itemId);

            const css = {
                'position': 'absolute',
                'top': (megaList.options.itemHeight * Math.floor(itemPos/megaList._calculated['itemsPerRow'])) + "px"
            };

            if (megaList._calculated['itemsPerRow'] > 1) {
                css['left'] = ((itemPos % megaList._calculated['itemsPerRow']) * megaList.options.itemWidth) + "px";
            }
            node.classList.add('megaListItem');

            Object.keys(css).forEach(function(prop, i) {
                node.style[prop] = css[prop];
            });
        }

        _rendered() {

            const megaList = this.megaList;
            assert(megaList.$content, 'megaList.$content is not ready.');
            megaList.content.style.height = megaList._calculated['contentHeight'] + "px";
            if(!this.options.usingNativeScroll) {
                Ps.update(this.megaList.listContainer);
            }
        }
    };

    MegaList.RENDER_ADAPTERS.Table = class TableRenderAdapter {

        constructor(options) {

            this.options = options || {};
            this.options.pusher = 'tr';
        }

        setMegaList(megaList) {

            this.megaList = megaList;
            megaList.options.preserveOrderInDOM = true;
        }

        _willRender() {

            const megaList = this.megaList;

            this.prePusherDOMNode = document.createElement(this.options.pusher);
            this.postPusherDOMNode = document.createElement(this.options.pusher);

            DOMUtils.prepend(this.prePusherDOMNode, megaList.content);

            megaList.content.appendChild(this.postPusherDOMNode);

            megaList.options._alwaysPrependAfter = this.prePusherDOMNode;
        }

        _repositionRenderedItem(itemId, node) {

            assert(this.megaList, 'megaList is not set.');

            const megaList = this.megaList;
            if (!node) {
                node = megaList._currentlyRendered[itemId];
            }
            if (node && !node.classList.contains('megaListItem')) {
                node.classList.add('megaListItem');
            }
        }

        _itemsRepositioned() {

            assert(this.megaList, 'megaList is not set.');
            assert(this.prePusherDOMNode, 'prePusherDOMNode is not set, is the list rendered?');
            assert(this.postPusherDOMNode, 'postPusherDOMNode is not set, is the list rendered?');

            const megaList = this.megaList;
            const calculated = megaList._calculated;

            if (this.megaList.options.appendOnly !== true) {
                const prepusherHeight = calculated['visibleFirstItemNum'] * megaList.options.itemHeight;
                this.prePusherDOMNode.style.height = prepusherHeight + "px";
            }

            const postpusherHeight = (megaList.items.length - calculated['visibleLastItemNum']) * megaList.options.itemHeight;
            this.postPusherDOMNode.style.height = postpusherHeight + "px";
        }

        _rendered() {

            const megaList = this.megaList;
            megaList.content.style.height = megaList._calculated['contentHeight'] -
                megaList.options.headerHeight - megaList.options.bottomSpacing + "px";
            if(!this.options.usingNativeScroll) {
                Ps.update(megaList.listContainer);
            }
        }
    };

    MegaList.RENDER_ADAPTERS.List = class ListRenderAdapter extends MegaList.RENDER_ADAPTERS.Table {

        constructor(options) {

            super(options);
            this.options.pusher = 'div';
        }
    };

    MegaList.RENDER_ADAPTERS.Grid = class GridRenderAdapter extends MegaList.RENDER_ADAPTERS.List {

        constructor(options) {

            super(options);
            this.spaceMaintainerCount = 0;
        }

        setMegaList(megaList) {

            this.megaList = megaList;
        }

        _itemsRepositioned() {

            assert(this.megaList, 'megaList is not set.');
            assert(this.prePusherDOMNode, 'prePusherDOMNode is not set, is the list rendered?');
            assert(this.postPusherDOMNode, 'postPusherDOMNode is not set, is the list rendered?');

            const megaList = this.megaList;
            const calculated = megaList._calculated;
            const _calcSpace = idx => Math.ceil(idx / calculated.itemsPerRow) * megaList.options.itemHeight;

            if (!calculated) {
                return;
            }

            if (this.megaList.options.appendOnly !== true) {
                this.prePusherDOMNode.style.height = `${_calcSpace(calculated.visibleFirstItemNum)}px`;
            }

            this.postPusherDOMNode.style.height =
                `${_calcSpace(megaList.items.length - calculated.visibleLastItemNum)}px`;

            this.createFiller();
        }

        createFiller() {

            const megaList = this.megaList;
            const calculated = megaList._calculated;

            let spaceRequired = megaList.items.length % calculated.itemsPerRow;

            if (spaceRequired !== 0) {

                spaceRequired = calculated.itemsPerRow - spaceRequired - this.spaceMaintainerCount;

                while(spaceRequired > 0) {

                    const spacer = document.createElement('a');
                    spacer.className = 'mega-node fm-item fm-filler-item';
                    megaList.content.insertBefore(spacer, this.postPusherDOMNode);
                    spaceRequired--;
                    this.spaceMaintainerCount++;
                }
            }
        }

        _rendered() {

            const megaList = this.megaList;
            assert(megaList.$content, 'megaList.$content is not ready.');
            megaList.content.style.height = megaList._calculated['contentHeight'] -
                megaList.options.headerHeight - megaList.options.bottomSpacing + "px";
            if(!this.options.usingNativeScroll) {
                Ps.update(this.megaList.listContainer);
            }
        }
    };

    scope.MegaList = MegaList;
})(window, jQuery);
