#' Locate the bundled OpenSketch application
#'
#' @return The absolute path to the bundled static application.
#' @export
opensketch_path <- function() {
  path <- system.file("app", package = "opensketch")
  if (!nzchar(path) || !file.exists(file.path(path, "index.html"))) {
    stop(
      "The bundled OpenSketch application is missing. ",
      "Install a release package or run `pnpm build` before installing.",
      call. = FALSE
    )
  }
  normalizePath(path, winslash = "/", mustWork = TRUE)
}

#' Launch OpenSketch
#'
#' Starts a local static-file server for the app bundled in the R package.
#' Editing, persistence, asset search, and export happen in the browser; this
#' server does not store or process project data.
#'
#' @param host Interface to bind to. The loopback default is recommended.
#' @param port TCP port. Use `NULL` to select a free local port.
#' @param launch.browser Open the application in the default browser.
#' @return A `opensketch_server` object. Pass it to [stop_opensketch()] when done.
#' @export
opensketch <- function(host = "127.0.0.1", port = NULL,
                      launch.browser = interactive()) {
  root <- opensketch_path()
  if (is.null(port)) {
    port <- httpuv::randomPort()
  }
  stopifnot(is.character(host), length(host) == 1L, nzchar(host))
  stopifnot(is.numeric(port), length(port) == 1L, is.finite(port))
  port <- as.integer(port)

  mime_types <- c(
    html = "text/html; charset=utf-8",
    js = "text/javascript; charset=utf-8",
    css = "text/css; charset=utf-8",
    json = "application/json; charset=utf-8",
    svg = "image/svg+xml",
    webp = "image/webp",
    png = "image/png",
    jpg = "image/jpeg",
    jpeg = "image/jpeg",
    woff = "font/woff",
    woff2 = "font/woff2",
    ttf = "font/ttf",
    ico = "image/x-icon"
  )

  app <- list(call = function(request) {
    request_path <- utils::URLdecode(sub("\\?.*$", "", request$PATH_INFO))
    relative <- sub("^/+", "", request_path)
    if (!nzchar(relative)) relative <- "index.html"

    candidate <- normalizePath(
      file.path(root, relative),
      winslash = "/",
      mustWork = FALSE
    )
    root_prefix <- paste0(root, "/")
    allowed <- identical(candidate, root) || startsWith(candidate, root_prefix)
    if (!allowed || !file.exists(candidate) || dir.exists(candidate)) {
      candidate <- file.path(root, "index.html")
    }

    extension <- tolower(tools::file_ext(candidate))
    content_type <- unname(mime_types[extension])
    if (length(content_type) == 0L || is.na(content_type)) {
      content_type <- "application/octet-stream"
    }

    list(
      status = 200L,
      headers = list(
        "Content-Type" = content_type,
        "Cache-Control" = if (extension == "html") {
          "no-cache"
        } else {
          "public, max-age=31536000, immutable"
        },
        "X-Content-Type-Options" = "nosniff",
        "Content-Security-Policy" = paste(
          "default-src 'self' blob: data:;",
          "script-src 'self';",
          "style-src 'self' 'unsafe-inline';",
          "img-src 'self' blob: data:;",
          "font-src 'self' data:;",
          "connect-src 'self';",
          "worker-src 'self' blob:;",
          "object-src 'none'; frame-ancestors 'none'; base-uri 'self'"
        )
      ),
      body = readBin(candidate, what = "raw", n = file.info(candidate)$size)
    )
  })

  server <- httpuv::startServer(host, port, app)
  url <- sprintf("http://%s:%d", host, port)
  handle <- structure(
    list(server = server, url = url, host = host, port = port),
    class = "opensketch_server"
  )
  if (isTRUE(launch.browser)) utils::browseURL(handle$url)
  handle
}

#' @export
print.opensketch_server <- function(x, ...) {
  cat("<OpenSketch local server>\n", x$url, "\n", sep = "")
  invisible(x)
}

#' Stop an OpenSketch server
#'
#' @param server A server returned by [opensketch()].
#' @return `TRUE`, invisibly.
#' @export
stop_opensketch <- function(server) {
  if (!inherits(server, "opensketch_server")) {
    stop("`server` must be returned by `opensketch()`.", call. = FALSE)
  }
  httpuv::stopServer(server$server)
  invisible(TRUE)
}
