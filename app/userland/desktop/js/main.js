import { LitElement, html } from 'beaker://app-stdlib/vendor/lit-element/lit-element.js'
import { repeat } from 'beaker://app-stdlib/vendor/lit-element/lit-html/directives/repeat.js'
import * as contextMenu from 'beaker://app-stdlib/js/com/context-menu.js'
import { ViewThreadPopup } from 'beaker://app-stdlib/js/com/popups/view-thread.js'
import { EditBookmarkPopup } from 'beaker://app-stdlib/js/com/popups/edit-bookmark.js'
import { NewPagePopup } from 'beaker://app-stdlib/js/com/popups/new-page.js'
import { NewPostPopup } from 'beaker://app-stdlib/js/com/popups/new-post.js'
import { AddLinkPopup } from './com/add-link-popup.js'
import * as toast from 'beaker://app-stdlib/js/com/toast.js'
import { writeToClipboard } from 'beaker://app-stdlib/js/clipboard.js'
import { shorten, pluralize } from 'beaker://app-stdlib/js/strings.js'
import { typeToQuery } from 'beaker://app-stdlib/js/records.js'
import * as desktop from './lib/desktop.js'
import * as addressBook from './lib/address-book.js'
import * as sourcesDropdown from './com/sources-dropdown.js'
import css from '../css/main.css.js'
import 'beaker://app-stdlib/js/com/record-feed.js'
import 'beaker://app-stdlib/js/com/sites-list.js'
import 'beaker://app-stdlib/js/com/img-fallbacks.js'

const VERSION_ID = (major, minor, patch, pre) => major * 1e9 + minor * 1e6 + patch * 1e3 + pre
const CURRENT_VERSION = VERSION_ID(1, 0, 0, 7)
const RELEASES = [
  { label: '1.0 - Beta 7', url: 'https://beakerbrowser.com/2020/07/15/beaker-1-0-beta-7.html' },
  { label: '1.0 - Beta 6', url: 'https://beakerbrowser.com/2020/07/10/beaker-1-0-beta-6.html' },
  { label: '1.0 - Beta 5', url: 'https://beakerbrowser.com/2020/06/19/beaker-1-0-beta-5.html' },
  { label: '1.0 - Beta 4', url: 'https://beakerbrowser.com/2020/06/04/beaker-1-0-beta-4.html' },
  { label: '1.0 - Beta 3', url: 'https://beakerbrowser.com/2020/05/28/beaker-1-0-beta-3.html' },
  { label: '1.0 - Beta 2', url: 'https://beakerbrowser.com/2020/05/20/beaker-1-0-beta-2.html' },
  { label: '1.0 - Beta 1', url: 'https://beakerbrowser.com/2020/05/14/beaker-1-0-beta.html' }
]
const DOCS_URL = 'https://docs.beakerbrowser.com'
const USERLIST_URL = 'https://userlist.beakerbrowser.com'
const BLAHBITY_BLOG_URL = 'hyper://a8e9bd0f4df60ed5246a1b1f53d51a1feaeb1315266f769ac218436f12fda830/'
const FILE_QUERIES = {
  blogposts: [typeToQuery('blogpost')],
  bookmarks: [typeToQuery('bookmark')],
  comments: [typeToQuery('comment')],
  pages: [typeToQuery('page')],
  posts: [typeToQuery('microblogpost')],
  notifications: ['notifications'],
  search: [
    typeToQuery('blogpost'),
    typeToQuery('bookmark'),
    typeToQuery('microblogpost'),
    typeToQuery('comment'),
    typeToQuery('page')
  ],
  all: [
    typeToQuery('blogpost'),
    typeToQuery('bookmark'),
    typeToQuery('microblogpost'),
    typeToQuery('comment'),
    typeToQuery('page'),
    typeToQuery('subscription')
  ]
}

var cacheBuster = Date.now()

class DesktopApp extends LitElement {
  static get properties () {
    return {
      currentNav: {type: String},
      profile: {type: Object},
      pins: {type: Array},
      suggestedSites: {type: Array},
      searchQuery: {type: String},
      sourceOptions: {type: Array},
      currentSource: {type: String},
      isIntroActive: {type: Boolean},
      legacyArchives: {type: Array},
      isEmpty: {type: Boolean},
    }
  }

  static get styles () {
    return css
  }

  constructor () {
    super()
    this.currentNav = 'all'
    this.profile = undefined
    this.pins = []
    this.suggestedSites = undefined
    this.unreadNotificationsCount = 0
    this.searchQuery = ''
    this.sourceOptions = []
    this.currentSource = 'all'
    this.isIntroActive = false
    this.legacyArchives = []
    this.isEmpty = false
    this.load().then(() => {
      this.loadSuggestions()
    })
    
    if (!('isIntroHidden' in localStorage)) {
      this.isIntroActive = true
    }

    window.addEventListener('focus', e => {
      this.load()
    })
    this.addEventListener('update-pins', async (e) => {
      this.pins = await desktop.load()
    })
  }

  async load () {
    cacheBuster = Date.now()
    let sourceOptions
    ;[this.profile, this.pins, sourceOptions, this.unreadNotificationsCount] = await Promise.all([
      addressBook.loadProfile(),
      desktop.load(),
      beaker.subscriptions.list(),
      beaker.index.countRecords({notification: {unread: true}})
    ])
    document.title = this.unreadNotificationsCount > 0 ? `New Tab (${this.unreadNotificationsCount})`: `New Tab`
    if (this.shadowRoot.querySelector('beaker-record-feed')) {
      this.shadowRoot.querySelector('beaker-record-feed').load()
    }
    this.sourceOptions = [{href: 'hyper://private/', title: 'My Private Data'}, {href: this.profile.url, title: this.profile.title}].concat(sourceOptions)
    console.log(this.pins)
    this.legacyArchives = await beaker.datLegacy.list()
  }

  async loadSuggestions () {
    let allSubscriptions = await beaker.index.listRecords({
      file: {mimetype: 'application/goto', prefix: '/subscriptions'},
      limit: 100,
      sort: 'ctime',
      reverse: true
    })
    var currentSubs = new Set(this.sourceOptions.map(source => (new URL(source.href)).origin))
    var candidates = allSubscriptions.filter(sub => !currentSubs.has((new URL(sub.metadata.href)).origin))
    var suggestedSites = candidates.reduce((acc, candidate) => {
      if (!candidate.metadata.title) return acc
      var url = candidate.metadata.href
      var existing = acc.find(v => v.url === url)
      if (existing) {
        existing.subscribers.push(candidate.site)
      } else {
        acc.push({
          url: candidate.metadata.href,
          title: candidate.metadata.title,
          subscribers: [candidate.site]
        })
      }
      return acc
    }, [])
    suggestedSites.sort(() => Math.random() - 0.5)
    this.suggestedSites = suggestedSites.slice(0, 3)
  }

  get currentNavAsFileQuery () {
    if (this.searchQuery && this.currentNav === 'all') {
      return FILE_QUERIES.search
    }
    return FILE_QUERIES[this.currentNav]
  }

  get currentNavDateTitleRange () {
    switch (this.currentNav) {
      case 'pages':
      case 'bookmarks':
      case 'blogposts':
      case 'pages':
        return 'month'
    }
  }

  get sources () {
    if (this.currentSource === 'all') {
      return undefined // all data in the index this.sourceOptions.map(source => source.url)
    }
    if (this.currentSource === 'mine') {
      return ['hyper://private/', this.profile.url]
    }
    if (this.currentSource === 'others') {
      return this.sourceOptions.slice(2).map(source => source.href)
    }
    return [this.currentSource]
  }

  get isLoading () {
    let queryViewEls = Array.from(this.shadowRoot.querySelectorAll('beaker-record-feed'))
    return !!queryViewEls.find(el => el.isLoading)
  }

  async setCurrentNav (nav) {
    this.currentNav = nav
    await this.requestUpdate()
    this.shadowRoot.querySelector('.all-view').scrollTop = 0
  }

  markAllNotificationsRead () {
    setTimeout(async () => {
      await beaker.index.clearNotifications()
      this.unreadNotificationsCount = 0
      document.title = 'New Tab'
    }, 3e3)
  }

  // rendering
  // =

  render () {
    // trigger "mark read" of notifications on view
    if (this.currentNav === 'notifications' && this.unreadNotificationsCount > 0) {
      this.markAllNotificationsRead()
    }

    return html`
      <link rel="stylesheet" href="beaker://assets/font-awesome.css">
      <div id="topright">
        <a href="beaker://settings/" title="Settings"><span class="fas fa-fw fa-cog"></span></a>
      </div>
      <header>
        <div class="search-ctrl">
          ${this.isLoading ? html`<span class="spinner"></span>` : html`<span class="fas fa-search"></span>`}
          ${!!this.searchQuery ? html`
            <a class="clear-search" @click=${this.onClickClearSearch}><span class="fas fa-times"></span></a>
          ` : ''}
          <input @keyup=${this.onKeyupSearch}>
          ${this.renderSourcesCtrl()}
        </div>
      </header>
      ${this.renderReleaseNotice()}
      <main>
        <div class="views">
          ${this.renderCurrentView()}
        </div>
      </main>
      ${this.renderIntro()}
    `
  }

  renderLeftSidebar () {
    const navItem = (id, label) => html`
      <a
        class="content-nav-item ${id === this.currentNav ? 'current' : ''}"
        @click=${e => this.setCurrentNav(id)}
      >${label}</a>
    `
    const ncount = this.unreadNotificationsCount
    return html`
      <div class="sidebar sticky">
        <div>
          <section class="content-nav">
            <h3>News</h3>
            ${navItem('all', html`<span class="fas fa-fw fa-stream"></span> Feed`)}
            ${navItem(
              'notifications',
              html`
                <span class="fas fa-fw fa-bell"></span>
                Notifications
                ${ncount > 0 ? html`<span class="count">${ncount}</span>` : ''}
              `
            )}
          </section>
          <section class="content-nav">
            <h3>Content</h3>
            ${navItem('bookmarks', html`<span class="far fa-fw fa-star"></span> <span class="label">Bookmarks</span>`)}
            ${navItem('blogposts', html`<span class="fas fa-fw fa-blog"></span> <span class="label">Blogposts</span>`)}
            ${navItem('posts', html`<span class="far fa-fw fa-comment-alt"></span> <span class="label">Posts</span>`)}
            ${navItem('pages', html`<span class="far fa-fw fa-file"></span> <span class="label">Pages</span>`)}
            ${navItem('comments', html`<span class="far fa-fw fa-comments"></span> <span class="label">Comments</span>`)}
            ${navItem('sites', html`<span class="fas fa-fw fa-sitemap"></span> <span class="label">Sites</span>`)}
          </section>
          <section class="quick-links">
            <h3>Quick Links</h3>
            <div>
              <a href="hyper://private/">
                <img src="asset:favicon-32:hyper://private/">
                <span>My Private Site</span>
              </a>
            </div>
            <div>
              <a href=${this.profile?.url}>
                <img src="asset:thumb:${this.profile?.url}">
                <span>My Profile</span>
              </a>
            </div>
            <div>
              <a href="beaker://library/">
                <img class="favicon" src="asset:favicon-32:beaker://library/">
                <span>My Library</span>
              </a>
            </div>
            <div>
              <a href="beaker://explorer/">
                <img class="favicon" src="asset:favicon-32:beaker://explorer/">
                <span>My Files</span>
              </a>
            </div>
          </section>
          <section class="quick-links">
            <h3>Beaker</h3>
            <div>
              <a href="#" @click=${this.onClickReleaseNotes}>
                <span class="fas fa-fw fa-rocket"></span>
                <span>Release Notes</span>
              </a>
            </div>
            <div>
              <a href="https://docs.beakerbrowser.com/">
                <span class="far fa-fw fa-life-ring"></span>
                <span>Help</span>
              </a>
            </div>
          </section>
        </div>
      </div>
    `
  }

  renderRightSidebar () {
    return html`
      <div class="sidebar">
        <div class="sticky">
          <section class="create-box">
            <h3>Create New</h3>
            <div class="btn-group">
              <button @click=${e => this.onClickEditBookmark(undefined)}>
                <i class="far fa-fw fa-star"></i> New Bookmark
              </button>
              <button @click=${this.onClickNewPost}>
                <i class="far fa-fw fa-comment"></i> New Post
              </button>
              <button @click=${e => this.onClickNewPage()}>
                <i class="far fa-fw fa-file"></i> New Page
              </button>
              <button @click=${this.onClickNewSite}>
                <i class="fas fa-fw fa-sitemap"></i> New Website
              </button>
            </div>
          </section>
          ${this.renderLegacyArchivesNotice()}
          ${this.suggestedSites?.length > 0 ? html`
            <section class="suggested-sites">
              <h3>Suggested Sites</h3>
              ${repeat(this.suggestedSites, site => html`
                <div class="site">
                  <div class="title">
                    <a href=${site.url} title=${site.title} target="_blank">${site.title}</a>
                  </div>
                  <div class="subscribers">
                    <a href="#" data-tooltip=${shorten(site.subscribers.map(s => s.title).join(', '), 100)}>
                      ${site.subscribers.length} known ${pluralize(site.subscribers.length, 'subscriber')}
                    </a>
                  </div>
                  ${site.subscribed ? html`
                    <button class="transparent" disabled><span class="fas fa-check"></span> Subscribed</button>
                  ` : html`
                    <button @click=${e => this.onClickSuggestedSubscribe(e, site)}>Subscribe</button>
                  `}
                </div>
              `)}
            </section>
          ` : ''}
        </div>
      </div>
    `
  }

  renderCurrentView () {
    let hasSearchQuery = !!this.searchQuery
    if (hasSearchQuery) {
      const searchLink = (label, url) => {
        return html`
          <a class="search-engine" title=${label} href=${url} data-tooltip=${label}>
            <img src="beaker://assets/search-engines/${label.toLowerCase()}.png">
          </a>
        `
      }
      return html`
        <div class="all-view">
          <div class="threecol">
            <div>
              ${this.renderLeftSidebar()}
            </div>
            <div>
              <div class="alternatives">
                Try your search on:
                ${searchLink('DuckDuckGo', `https://duckduckgo.com?q=${encodeURIComponent(this.searchQuery)}`)}
                ${searchLink('Google', `https://google.com/search?q=${encodeURIComponent(this.searchQuery)}`)}
                ${searchLink('Twitter', `https://twitter.com/search?q=${encodeURIComponent(this.searchQuery)}`)}
                ${searchLink('Reddit', `https://reddit.com/search?q=${encodeURIComponent(this.searchQuery)}`)}
                ${searchLink('GitHub', `https://github.com/search?q=${encodeURIComponent(this.searchQuery)}`)}
                ${searchLink('YouTube', `https://www.youtube.com/results?search_query=${encodeURIComponent(this.searchQuery)}`)}
                ${searchLink('Wikipedia', `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(this.searchQuery)}`)}
              </div>
              ${this.currentNav === 'all' || this.currentNav === 'sites' ? html`
                ${this.renderSites()}
              ` : ''}
              ${this.currentNav !== 'sites' ? html`
                <beaker-record-feed
                  class="subview"
                  .fileQuery=${this.currentNavAsFileQuery}
                  .filter=${this.searchQuery}
                  .sources=${this.sources}
                  limit="50"
                  @load-state-updated=${this.onFeedLoadStateUpdated}
                  @view-thread=${this.onViewThread}
                  @publish-reply=${this.onPublishReply}
                  profile-url=${this.profile ? this.profile.url : ''}
                ></beaker-record-feed>
              ` : ''}
            </div>
            ${this.renderRightSidebar()}
          </div>
        </div>
      `
    } else {
      return html`
        <div class="all-view">
          ${this.currentNav === 'all' ? this.renderPins() : ''}
          <div class="threecol">
            <div>
              ${this.renderLeftSidebar()}
            </div>
            <div>
              ${this.currentNav === 'sites' ? html`
                ${this.renderSites()}
              ` : this.currentNav === 'legacy-archives' ? html`
                ${this.renderLegacyArchivesView()}
              ` : html`
                ${this.isEmpty ? this.renderEmptyMessage() : ''}
                <beaker-record-feed
                  show-date-titles
                  date-title-range=${this.currentNavDateTitleRange}
                  .fileQuery=${this.currentNavAsFileQuery}
                  .sources=${this.sources}
                  limit="50"
                  @load-state-updated=${this.onFeedLoadStateUpdated}
                  @view-thread=${this.onViewThread}
                  @publish-reply=${this.onPublishReply}
                  profile-url=${this.profile ? this.profile.url : ''}
                ></beaker-record-feed>
              `}
            </div>
            ${this.renderRightSidebar()}
          </div>
        </div>
      `
    }
  }

  renderSites () {
    if (this.searchQuery) {
      return html`
        <beaker-sites-list
          listing="all"
          filter=${this.searchQuery}
          single-row
          .profile=${this.profile}
        ></beaker-sites-list>
      `
    }
    return html`
      <beaker-sites-list
        listing="mine"
        single-row
        .profile=${this.profile}
      ></beaker-sites-list>
      <beaker-sites-list
        listing="subscribed"
        single-row
        .profile=${this.profile}
      ></beaker-sites-list>
      <beaker-sites-list
        listing="suggested"
        single-row
        .profile=${this.profile}
      ></beaker-sites-list>
    `
  }

  renderEmptyMessage () {
    if (this.currentNav === 'notifications') {
      return html`
        <div class="empty">
          <div class="fas fa-bell"></div>
          <div>You have no notifications.</div>
        </div>
        `
    }
    let thing = this.currentNav
    if (this.currentNav === 'all') thing = 'news'
    var icon = ({
      bookmarks: 'far fa-star',
      blogposts: 'fas fa-blog',
      posts: 'far fa-comment-alt',
      pages: 'far fa-file',
      comments: 'far fa-comments',
      sites: 'fas fa-sitemap'
    })[this.currentNav] || 'fas fa-stream'
    return html`
      <div class="empty">
          <div class=${icon}></div>
        <div>No ${thing}... yet!</div>
      </div>
    `
  }

  renderSourcesCtrl () {
    var label = ''
    switch (this.currentSource) {
      case 'all': label = 'All'; break
      case 'mine': label = 'My Data'; break
      case 'others': label = 'Others\'s Data'; break
      default: label = this.sourceOptions.find(opt => opt.href === this.currentSource)?.title
    }
    return html`
      <a class="search-mod-btn" @click=${this.onClickSources}>
        <span class="label">Source: </span>${label} <span class="fas fa-fw fa-caret-down"></span>
      </a>
    `
  }

  renderReleaseNotice () {
    if (localStorage.lastDismissedReleaseNotice >= CURRENT_VERSION) {
      return ''
    }
    return html`
      <div class="release-notice">
        <a href=${RELEASES[0].url} class="view-release-notes" @click=${this.onCloseReleaseNotes} target="_blank">
          <span class="fas fa-fw fa-rocket"></span>
          <strong>Welcome to Beaker ${RELEASES[0].label}!</strong>
          Click here to see what's new.
        </a>
        <a class="close" @click=${this.onCloseReleaseNotes}><span class="fas fa-times"></span></a>
      </div>
    `
  }

  renderPins () {
    var pins = this.pins || []
    return html`
      <div class="pins">
        ${repeat(pins, pin => pin.href, pin => html`
          <a
            class="pin"
            href=${pin.href}
            @contextmenu=${e => this.onContextmenuPin(e, pin)}
          >
            <div class="thumb-wrapper">
              <img src=${'asset:screenshot-180:' + pin.href} class="thumb"/>
            </div>
            <div class="details">
              <div class="title">${pin.title}</div>
            </div>
          </a>
        `)}
        <a class="pin add" @click=${e => this.onClickNewBookmark(e, true)}>
          <span class="fas fa-fw fa-plus thumb"></span>
        </a>
      </div>
    `
  }

  renderIntro () {
    if (!this.isIntroActive) {
      return ''
    }
    return html`
      <div class="intro">
        <a class="close" @click=${this.onClickCloseIntro}><span class="fas fa-times"></span></a>
        <h3>Welcome to Beaker!</h3>
        <h5>Let's set up your network and get you familiar with Beaker.</h5>
        <div class="col3">
          <div>
            ${this.profile ? html`
              <a href=${this.profile.url} target="_blank">
                <beaker-img-fallbacks class="avatar">
                  <img src="${this.profile.url}/thumb?cache_buster=${cacheBuster}" slot="img1">
                  <img src="beaker://assets/default-user-thumb" slot="img2">
                </beaker-img-fallbacks>
              </a>
            ` : ''}
            <h4>1. Customize your <a href=${this.profile ? this.profile.url : ''} target="_blank">profile</a></h4>
            <p class="help-link">
              <a href="${DOCS_URL}/joining-the-social-network#customizing-your-profile-drive" target="_blank">
                <span class="fas fa-fw fa-info-circle"></span> Get help with this step
              </a>
            </p>
          </div>
          <div>
            <a class="icon" href="${USERLIST_URL}" target="_blank">
              <span class="fas fa-user-plus"></span>
            </a>
            <h4>2. Add yourself to <a href="${USERLIST_URL}" target="_blank">the directory</a></h4>
            <p class="help-link">
              <a href="${DOCS_URL}/joining-the-social-network#finding-other-users" target="_blank">
                <span class="fas fa-fw fa-info-circle"></span> Get help with this step
              </a>
            </p>
          </div>
          <div>
            <a class="icon" href=${BLAHBITY_BLOG_URL} target="_blank">
              <span class="fas fa-stream"></span>
            </a>
            <h4>3. Say hello on <a href=${BLAHBITY_BLOG_URL} target="_blank">your feed</a></h4>
            <p class="help-link">
              <a href="${DOCS_URL}/joining-the-social-network#say-hello-on-your-feed" target="_blank">
                <span class="fas fa-fw fa-info-circle"></span> Get help with this step
              </a>
            </p>
          </div>
        </div>
        <div class="col1">
          <a class="icon" href="${DOCS_URL}/getting-started-with-beaker" target="_blank">
            <span class="fas fa-book"></span>
          </a>
          <h4>4. Read the <a href="${DOCS_URL}/getting-started-with-beaker" target="_blank">Getting Started Guide</a>.</h4>
        </div>
      </div>
    `
  }

  renderLegacyArchivesNotice () {
    if (this.legacyArchives.length === 0) {
      return ''
    }
    return html`
      <section class="legacy-archives notice">
        <h3>Legacy Dats</h3>
        <p>You have ${this.legacyArchives.length} legacy Dat ${pluralize(this.legacyArchives.length, 'archive')} which can be converted to Hyperdrive.</p>
        <div class="archives">
          ${this.legacyArchives.slice(0, 3).map(archive => html`
            <div class="archive">
              <a href="dat://${archive.key}" title=${archive.title} target="_blank">${archive.title || archive.key}</a>
              <div class="btn-group">
                <button @click=${e => {window.location = `dat://${archive.key}`}}>View</button>
                <button @click=${e => this.onClickRemoveLegacyArchive(e, archive)}>Remove</button>
              </div>
            </div>
          `)}
          ${this.legacyArchives.length > 3 ? html`
            <a @click=${e => { this.currentNav = 'legacy-archives' }}>View All &raquo;</a>
          ` : ''}
        </div>
      </section>
    `
  }

  renderLegacyArchivesView () {
    if (this.legacyArchives.length === 0) {
      return ''
    }
    return html`
      <section class="legacy-archives view">
        <h3>Legacy Dats</h3>
        <p>You have ${this.legacyArchives.length} legacy Dat ${pluralize(this.legacyArchives.length, 'archive')} which can be converted to Hyperdrive.</p>
        <div class="archives">
          ${this.legacyArchives.map(archive => html`
            <div class="archive">
              <a href="dat://${archive.key}" title=${archive.title} target="_blank">${archive.title || archive.key}</a>
              <div class="btn-group">
                <button @click=${e => {window.location = `dat://${archive.key}`}}>View</button>
                <button @click=${e => this.onClickRemoveLegacyArchive(e, archive)}>Remove</button>
              </div>
            </div>
          `)}
        </div>
      </section>
    `
  }

  // events
  // =

  onFeedLoadStateUpdated (e) {
    if (typeof e.detail?.isEmpty !== 'undefined') {
      this.isEmpty = e.detail.isEmpty
    }
    this.requestUpdate()
  }

  onClickCloseIntro (e) {
    this.isIntroActive = false
    localStorage.isIntroHidden = 1
  }

  onClickReleaseNotes (e) {
    e.preventDefault()
    e.stopPropagation()
    const items = RELEASES.slice().reverse().map(({label, url}) => ({
      icon: false,
      label: `Beaker ${label}`,
      click: () => window.open(url)
    }))
    var rect = e.currentTarget.getClientRects()[0]
    contextMenu.create({
      x: rect.right + 5,
      y: rect.bottom + 15,
      noBorders: true,
      roomy: true,
      top: true,
      items,
      fontAwesomeCSSUrl: 'beaker://assets/font-awesome.css'
    })
  }

  onClickSources (e) {
    e.preventDefault()
    e.stopPropagation()
    const fixedClick = (v) => {
      this.currentSource = v
      this.load()
    }
    const items = this.sourceOptions.slice(1).map(({href, title}) => ({
      icon: false,
      label: title,
      click: () => {
        this.currentSource = href
        this.load()
      }
    }))
    var rect = e.currentTarget.getClientRects()[0]
    sourcesDropdown.create({x: (rect.left + rect.right) / 2, y: rect.bottom, items, fixedClick})
  }

  onCloseReleaseNotes (e) {
    localStorage.lastDismissedReleaseNotice = CURRENT_VERSION
    this.requestUpdate()
  }

  onKeyupSearch (e) {
    var value = e.currentTarget.value.toLowerCase()
    if (this.keyupSearchTo) {
      clearTimeout(this.keyupSearchTo)
    }
    this.keyupSearchTo = setTimeout(() => {
      this.searchQuery = value
      this.keyupSearchTo = undefined
    }, 100)
  }

  onClickClearSearch (e) {
    this.searchQuery = ''
    this.shadowRoot.querySelector('.search-ctrl input').value = ''
  }

  onClickNavMore (e) {
    var rect = e.currentTarget.getClientRects()[0]
    e.preventDefault()
    e.stopPropagation()
    const items = [
      {icon: 'far fa-comment-alt', label: 'Posts', click: () => this.setCurrentNav('posts') },
      {icon: 'far fa-file', label: 'Pages', click: () => this.setCurrentNav('pages') },
      {icon: 'far fa-comments', label: 'Comments', click: () => this.setCurrentNav('comments') }
    ]
    contextMenu.create({
      x: (rect.left + rect.right) / 2,
      y: rect.bottom,
      center: true,
      noBorders: true,
      roomy: true,
      rounded: true,
      style: `padding: 6px 0`,
      items,
      fontAwesomeCSSUrl: 'beaker://assets/font-awesome.css'
    })
  }

  async onClickNewSite (e) {
    var drive = await beaker.hyperdrive.createDrive()
    beaker.browser.openUrl(drive.url, {setActive: true, addedPaneUrls: ['beaker://editor/']})
  }

  async onClickNewPost (e) {
    try {
      await NewPostPopup.create({driveUrl: this.profile.url})
      toast.create('Post created', '', 10e3)
    } catch (e) {
      // ignore, user probably cancelled
      console.log(e)
      return
    }
    this.load()
  }

  async onClickNewBookmark (e, pinned) {
    try {
      await desktop.createLink(await AddLinkPopup.create(), pinned)
      toast.create('Link added', '', 10e3)
    } catch (e) {
      // ignore, user probably cancelled
      console.log(e)
      return
    }
    this.load()
  }

  async onContextmenuPin (e, pin) {
    e.preventDefault()
    const items = [
      {label: 'Open Link in New Tab', click: () => window.open(pin.href)},
      {label: 'Copy Link Address', click: () => writeToClipboard(pin.href)},
      (pin.isFixed) ? undefined : {type: 'separator'},
      (pin.isFixed) ? undefined : {label: 'Edit', click: () => this.onClickEditBookmark(pin)},
      (pin.isFixed) ? undefined : {label: 'Unpin', click: () => this.onClickUnpinBookmark(pin)}
    ].filter(Boolean)
    var fns = {}
    for (let i = 0; i < items.length; i++) {
      if (items[i].id) continue
      let id = `item=${i}`
      items[i].id = id
      fns[id] = items[i].click
      delete items[i].click
    }
    var choice = await beaker.browser.showContextMenu(items)
    if (fns[choice]) fns[choice]()
  }

  async onClickNewPage (opts = {}) {
    try {
      var res = await NewPagePopup.create(opts)
      beaker.browser.openUrl(res.url, {setActive: true, addedPaneUrls: ['beaker://editor/']})
    } catch (e) {
      // ignore
      console.log(e)
    }
  }

  async onClickEditBookmark (file) {
    try {
      await EditBookmarkPopup.create(file)
      this.load()
    } catch (e) {
      // ignore
      console.log(e)
    }
  }

  async onClickUnpinBookmark (bookmark) {
    await beaker.bookmarks.add(Object.assign({}, bookmark, {pinned: false}))
    toast.create('Bookmark unpinned', '', 10e3)
    this.load()
  }

  onViewThread (e) {
    ViewThreadPopup.create({
      recordUrl: e.detail.record.url,
      profileUrl: this.profile.url
    })
  }

  onPublishReply (e) {
    toast.create('Reply published', '', 10e3)
    this.load()
  }

  async onClickRemoveLegacyArchive (e, archive) {
    e.preventDefault()
    if (!confirm('Are you sure?')) return
    await beaker.datLegacy.remove(archive.key)
    this.legacyArchives.splice(this.legacyArchives.indexOf(archive), 1)
    toast.create('Archive removed')
    this.requestUpdate()
  }

  async onClickSuggestedSubscribe (e, site) {
    e.preventDefault()
    site.subscribed = true
    this.requestUpdate()
    await beaker.subscriptions.add({
      href: site.url,
      title: site.title,
      site: this.profile.url
    })
  }
}

customElements.define('desktop-app', DesktopApp)
