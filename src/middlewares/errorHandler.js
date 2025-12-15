const errorHandler = (err, req, res, next) => {
  const status = err.statusCode || err.status || 500;

  console.error("Error:", err.message);

  res.status(status).json({
    success: false,
    statusCode: status,
    message: err.message || "Internal Server Error",
  });
};

export default errorHandler;