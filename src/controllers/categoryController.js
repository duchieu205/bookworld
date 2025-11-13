import Category from "../models/Category.js";
import createError from "../utils/createError.js";

// Hàm tạo slug (bỏ dấu tiếng Việt)
const generateSlug = (name) => {
    return String(name)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
};

// Tạo category mới
export const createCategory = async (req, res) => {
    try {
        const { name, description, status } = req.body;

        // Validate required fields
        if (!name) throw createError(400, "Tên danh mục là bắt buộc");
        if (!description) throw createError(400, "Mô tả danh mục là bắt buộc");

        // Kiểm tra tên đã tồn tại
        const existingName = await Category.findOne({ name });
        if (existingName) {
            throw createError(409, `Danh mục "${name}" đã tồn tại`);
        }

        // Tạo slug từ tên
        let slug = generateSlug(name);
        
        // Nếu slug đã tồn tại, thêm số vào sau
        let counter = 0;
        while (await Category.findOne({ slug: counter === 0 ? slug : `${slug}-${counter}` })) {
            counter++;
        }
        if (counter > 0) {
            slug = `${slug}-${counter}`;
        }

        // Tạo category mới
        const category = await Category.create({
            name,
            slug,
            description,
            status: status || "active"
        });

        return res.success(category, "Tạo danh mục thành công", 201);
    } catch (error) {
        if (error.code === 11000) {
            throw createError(409, "Danh mục đã tồn tại");
        }
        throw error;
    }
};

// Lấy danh sách categories
export const getCategories = async (req, res) => {
    const { page = 1, limit = 20, search, status } = req.query;
    
    // Xây dựng query
    const query = {};
    if (search) {
        query.$or = [
            { name: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } }
        ];
    }
    if (status) query.status = status;

    // Tính pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, parseInt(limit));
    const skip = (pageNum - 1) * limitNum;

    // Thực hiện query
    const total = await Category.countDocuments(query);
    const items = await Category.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum);

    return res.success({
        items,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
    }, "Lấy danh sách danh mục thành công");
};

// Lấy category theo id
export const getCategoryById = async (req, res) => {
    const { id } = req.params;
    
    const category = await Category.findById(id);
    if (!category) {
        throw createError(404, "Không tìm thấy danh mục");
    }

    return res.success(category, "Lấy thông tin danh mục thành công");
};

// Cập nhật category
export const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Nếu update name, kiểm tra trùng và tạo slug mới
        if (updates.name) {
            const existingName = await Category.findOne({ 
                name: updates.name,
                _id: { $ne: id }
            });
            if (existingName) {
                throw createError(409, `Danh mục "${updates.name}" đã tồn tại`);
            }

            // Tạo slug mới từ tên mới
            updates.slug = generateSlug(updates.name);
        }

        const category = await Category.findByIdAndUpdate(
            id,
            updates,
            { new: true, runValidators: true }
        );

        if (!category) {
            throw createError(404, "Không tìm thấy danh mục");
        }

        return res.success(category, "Cập nhật danh mục thành công");
    } catch (error) {
        if (error.code === 11000) {
            throw createError(409, "Tên danh mục đã tồn tại");
        }
        throw error;
    }
};

// Xóa category
export const deleteCategory = async (req, res) => {
    const { id } = req.params;
    
    const category = await Category.findByIdAndDelete(id);
    if (!category) {
        throw createError(404, "Không tìm thấy danh mục");
    }

    return res.success(category, "Xóa danh mục thành công");
};

export default {
    createCategory,
    getCategories,
    getCategoryById,
    updateCategory,
    deleteCategory
};