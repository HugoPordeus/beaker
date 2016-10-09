/*
This uses the beakerDownloads API, which is exposed by webview-preload to all sites loaded over the beaker: protocol
*/

import * as yo from 'yo-yo'
import co from 'co'
import emitStream from 'emit-stream'
import prettyBytes from 'pretty-bytes'
import { ucfirst } from '../../lib/strings'
import { pushUrl, writeToClipboard } from '../../lib/fg/event-handlers'
import toggleable, { closeAllToggleables } from '../com/toggleable'
import { render as renderDownloadsList } from '../com/downloads-list'

// globals
// =

var isViewActive = false
var archives
var downloads

// exported API
// =

export function setup () {
  var dlEvents = emitStream(beakerDownloads.eventsStream())
  dlEvents.on('new-download', onNewDownload)
  dlEvents.on('updated', onUpdateDownload)
  dlEvents.on('done', onUpdateDownload)
}

export function show () {
  isViewActive = true
  document.title = 'Downloads'
  co(function* () {
    // fetch downloads
    downloads = yield beakerDownloads.getDownloads()
    // fetch archives
    archives = yield datInternalAPI.getSavedArchives()
    archives = archives.filter(a => !a.isOwner) // non-owned archives only
    archives.sort((a, b) => b.mtime - a.mtime)
    // render now
    render()
    // now fetch archive stats
    var stats = yield Promise.all(archives.map(a => datInternalAPI.getArchiveStats(a.key)))
    archives.forEach((archive, i) => archive.stats = stats[i])
    console.log(archives)
    // and render again, now that we have the stats
    render()
  })
}

export function hide () {
  isViewActive = false
  archives = null
  downloads = null
}

// rendering
// =

function render () {
  if (!isViewActive) {
    return
  }

  var downloadEls = downloads.map(d => {
    var progress, status, action
    var canShow = false, canCancel = false
    if (d.state === 'progressing') {
      // progress
      status = (d.isPaused) ? 'Paused' : (prettyBytes(d.downloadSpeed) + '/s')
      progress = `${prettyBytes(d.receivedBytes)} / ${prettyBytes(d.totalBytes)}`

      // actions
      canCancel = true
      if (d.isPaused) {
        action = yo`<a class="btn" onclick=${e => onResumeDownload(e, d)} title="Resume"><span class="icon icon-play"></span> Resume</a>`
      } else {
        action = yo`<a class="btn" onclick=${e => onPauseDownload(e, d)} title="Pause"><span class="icon icon-pause"></span> Pause</a>`
      }
    } else if (d.state === 'completed') {
      // progress
      progress = prettyBytes(d.totalBytes)
      status = 'Done'

      // actions
      if (!d.fileNotFound) {
        canShow = true
        action = yo`<a class="btn" onclick=${e => onOpenDownload(e, d)} title="Open"><span class="icon icon-popup"></span> Open</a>`
      } else {
        // TODO
        // action = yo`<div>File not found (moved or deleted)</div>`
      }
    } else {
      status = ucfirst(d.state)
    }

    // render download
    return yo`<div class="ll-row download">
      <div class="ll-link">
        <img class="favicon" src=${'beaker-favicon:'+d.url} />
        ${ canShow
          ? yo`<a class="ll-title" onclick=${e => onOpenDownload(e, d)} title=${d.name}>${d.name}</a>`
          : yo`<span class="ll-title" title=${d.name}>${d.name}</a>` }
      </div>
      <div class="ll-status">${status}</div>
      <div class="ll-progress">${progress}</div>
      <div class="ll-progressbar"><progress value=${d.receivedBytes} max=${d.totalBytes}></progress></div>
      <div class="ll-serve">${action}</div>
      <div class="ll-dropdown">${toggleable(yo`
        <div class="dropdown-btn-container" data-toggle-id=${`download-${d.id}`}>
          <a class="toggleable btn"><span class="icon icon-down-open-mini"></span></a>
          <div class="dropdown-btn-list">
            ${ canShow
              ? yo`<a onclick=${e => onShowDownload(e, d)}><span class="icon icon-docs"></span> Show in Finder</a>`
              : yo`<a class="disabled"><span class="icon icon-docs"></span> Show in Finder</a>` }
            <div onclick=${e => onCopyDownloadLink(e, d)}><span class="icon icon-link"></span> Copy Link</div>
            <hr>
            ${ canCancel
              ? yo`<a onclick=${e => onCancelDownload(e, d)}><span class="icon icon-cancel"></span> Cancel</a>`
              : yo`<a onclick=${e => onRemoveDownload(e, d)}><span class="icon icon-cancel"></span> Remove</a>` }
          </div>
        </div>
      `)}</div>
    </div>`
  }).reverse()

  // empty state
  if (downloadEls.length === 0) {
    downloadEls = yo`<div class="downloads-empty">No active or recent downloads.</div>`
  }

  yo.update(document.querySelector('#el-content'), yo`<div class="pane" id="el-content">
    <div class="downloads">
      <div class="ll-heading">
        Dat Downloads
        <small class="ll-heading-right">
          <a href="https://beakerbrowser.com/docs/" title="Get Help"><span class="icon icon-lifebuoy"></span> Help</a>
        </small>
      </div>
      ${renderDownloadsList(archives, { renderEmpty, onToggleServeArchive, onDeleteArchive, onUndoDeletions })}
      <div class="ll-heading">
        File Downloads
      </div>
      <div class="links-list">
        ${downloadEls}
      </div>
    </div>
  </div>`)
}

function renderEmpty () {
  return yo`<div class="archives-empty">
      <div class="archives-empty-banner">
        <div class="icon icon-info-circled"></div>
        <div>
          Share files on the network by creating archives.
          <a class="icon icon-popup" href="https://beakerbrowser.com/docs/" target="_blank"> Learn More</a>
        </div>
      </div>
    </div>
  </div>`
}

// event handlers
// =

function onNewDownload () {
  // do a little animation
  // TODO
}

function onUpdateDownload (download) {
  if (!downloads)
    return

  // patch data each time we get an update
  var target = downloads.find(d => d.id == download.id)
  if (target) {
    // patch item
    for (var k in download)
      target[k] = download[k]
  } else
    downloads.push(download)
  render()
}

function onPauseDownload (e, download) {
  beakerDownloads.pause(download.id)
}

function onResumeDownload (e, download) {
  beakerDownloads.resume(download.id)
}

function onCancelDownload (e, download) {
  closeAllToggleables()
  beakerDownloads.cancel(download.id)
}

function onCopyDownloadLink (e, download) {
  closeAllToggleables()
  writeToClipboard(download.url)
}

function onShowDownload (e, download) {
  closeAllToggleables()
  beakerDownloads.showInFolder(download.id)
    .catch(err => {
      download.fileNotFound = true
      render()
    })
}

function onOpenDownload (e, download) {
  closeAllToggleables()
  beakerDownloads.open(download.id)
    .catch(err => {
      download.fileNotFound = true
      render()
    })
}

function onRemoveDownload (e, download) {
  closeAllToggleables()
  beakerDownloads.remove(download.id)
  downloads.splice(downloads.indexOf(download), 1)
  render()
}

function onToggleServeArchive (archiveInfo) {
  return e => {
    e.preventDefault()
    e.stopPropagation()

    archiveInfo.userSettings.isServing = !archiveInfo.userSettings.isServing

    // isSaved must reflect isServing
    if (archiveInfo.userSettings.isServing && !archiveInfo.userSettings.isSaved)
      archiveInfo.userSettings.isSaved = true
    datInternalAPI.setArchiveUserSettings(archiveInfo.key, archiveInfo.userSettings)

    render()
  }
}

function onDeleteArchive (archiveInfo) {
  return e => {
    e.preventDefault()
    e.stopPropagation()
      
    archiveInfo.userSettings.isSaved = !archiveInfo.userSettings.isSaved

    // isServing must reflect isSaved
    if (!archiveInfo.userSettings.isSaved && archiveInfo.userSettings.isServing)
      archiveInfo.userSettings.isServing = false

    datInternalAPI.setArchiveUserSettings(archiveInfo.key, archiveInfo.userSettings)
    render()
  }
}

function onUndoDeletions (e) {
  e.preventDefault()
  e.stopPropagation()

  archives.forEach(archiveInfo => {
    if (!archiveInfo.userSettings.isSaved) {
      archiveInfo.userSettings.isSaved = true
      datInternalAPI.setArchiveUserSettings(archiveInfo.key, archiveInfo.userSettings)
    }
  })
  render()
}