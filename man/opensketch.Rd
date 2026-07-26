\name{opensketch}
\alias{opensketch}
\title{Launch OpenSketch}
\usage{
opensketch(host = "127.0.0.1", port = NULL, launch.browser = interactive())
}
\arguments{
\item{host}{Interface to bind to. The loopback default is recommended.}
\item{port}{TCP port. Use \code{NULL} to select a free local port.}
\item{launch.browser}{Open the application in the default browser.}
}
\value{A \code{opensketch_server} object.}
\description{
Starts a local static-file server for the OpenSketch app bundled in the package.
All document data remains in the browser.
}
