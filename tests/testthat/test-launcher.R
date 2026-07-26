test_that("bundled application is present", {
  path <- opensketch_path()
  expect_true(dir.exists(path))
  expect_true(file.exists(file.path(path, "index.html")))
  expect_true(length(list.files(file.path(path, "assets"), pattern = "\\.ttf$")) >= 3L)
})

test_that("launcher validates server handles", {
  expect_error(stop_opensketch(list()), "must be returned")
})

test_that("launcher starts and stops a loopback static server", {
  server <- opensketch(port = NULL, launch.browser = FALSE)
  on.exit(try(stop_opensketch(server), silent = TRUE), add = TRUE)
  expect_s3_class(server, "opensketch_server")
  expect_match(server$url, "^http://127[.]0[.]0[.]1:")
  expect_true(stop_opensketch(server))
})
