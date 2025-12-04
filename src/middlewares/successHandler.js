export const formatResponseSuccess = (req, res, next) => {
    // Thêm phương thức success vào đối tượng response
    res.success = function (
        data = null,
        message = "Thành công",
        statusCode = 200
    ) {
        return this.status(statusCode).json({
            statusCode,
            message,
            data,
        });
    };

    next();
};