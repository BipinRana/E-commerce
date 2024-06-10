var con = require('./connect'); 
var path = require('path');
var express = require('express');
var app = express();

const bcrypt= require('bcrypt');

const multer = require('multer');
const storage =multer.memoryStorage();
const upload = multer({storage:storage });

const session = require('express-session');
const body_parser = require('body-parser');
app.use(session({
    secret: 'bipin123', 
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge:   12000 * 1000 } 
}));

app.use(body_parser.urlencoded({ extended: false }));
app.use(body_parser.json());
app.use(express.static(path.join(__dirname, 'frontend')));
app.set('view engine', 'ejs');

app.get('/',function(req, res){
    if (req.session.adminDetails) {
        res.redirect('/adminPage');
    } else {
        res.sendFile(__dirname+'/frontend/adminLogin.html');
    } 
});



app.post('/',function(req, res){
    const requestData = req.body;
    const username = requestData.idValue;
    const password = requestData.passwordValue;
    const query = "SELECT adminId, adminPassword FROM admin WHERE adminId=?";
    
    con.query(query, [username], function (error, result) {
        if (error) {
            console.error(error);
            res.status(500).send("Internal Server Error");
            return;
        } 
        if (result.length===0){
            res.json({message:'No such Admin ID found!!'});
        }
        else if (result.length > 0) {
            bcrypt.compare(password, result[0].adminPassword, function(err, match) {
                if (err) {
                    console.error('Error comparing passwords:', err);
                } else {
                    if (match) {
                        console.log('Password matches!'); // Passwords match
                        const adminDetails = {
                            adminId: result[0].adminId
                        };
                        req.session.adminDetails = adminDetails;
                        res.redirect('/adminPage');
                    } else {
                        res.json({message:'Wrong credentials'}); // Passwords do not match
                    }
                }
            });
            
        }
    });
});
app.get('/adminPage',function(req, res){
        res.sendFile(__dirname+'/frontend/dashboard.html');
});

app.get('/checkEntry', (req, res) => {
    if (req.session.adminDetails) {
        console.log('checking...');
        res.send({ entryMessage: 'Admin session active' });
    } else {
        res.json({ entryMessage: 'Admin session expired. Please login again' });
    }
});


app.get('/adminPageContent', (req, res) => {
    const adminDetails = req.session.adminDetails.adminId;
    const Outterquery = `
        SELECT 
            COUNT(orders.orderId) as orderCount,
            COUNT(DISTINCT customer.userId) as customerCount,
            SUM(orders.TotalPrice) as productWorth,
            (COUNT(DISTINCT orders.userId)/COUNT(DISTINCT customer.userId)*100) as userPercent
        FROM  
            customer 
        LEFT JOIN 
            orders ON customer.userId = orders.userId;
    `;

    const innerQuery = `
        SELECT 
            product.itemName,
            SUM(orders.Quantity) AS totalQuantity,
            product.itemImage1
        FROM  
            orders
        JOIN 
            product ON orders.productId = product.itemID
        GROUP BY 
            product.itemName
        ORDER BY 
            totalQuantity DESC
        LIMIT 1;
    `;

    const graphQuery = `
        SELECT 
            TotalPrice,TimeStamp
        FROM 
            orders
    `;

    const adminPowerQuery = `SELECT addPower, updatePower, adminPower FROM admin WHERE adminId = ?`;

    con.query(Outterquery, (outterError, result1) => {
        if (outterError) {
            console.error(outterError);
            res.status(500).send("Internal Server Error");
            return;
        }

        con.query(innerQuery, (innerError, result2) => {
            if (innerError) {
                console.error(innerError);
                res.status(500).send("Internal Server Error");
                return;
            }

            con.query(graphQuery, (graphError, result3) => {
                if (graphError) {
                    console.error(graphError);
                    res.status(500).send("Internal Server Error");
                    return;
                }

                con.query(adminPowerQuery, [adminDetails], (adminPowerError, adminPowerResult) => {
                    if (adminPowerError) {
                        console.error(adminPowerError);
                        res.status(500).send("Internal Server Error");
                        return;
                    }
                    const image1Buffer = result2[0].itemImage1; 
const base64Image = Buffer.from(image1Buffer).toString('base64');
const modifiedImage = `data:image/png;base64,${base64Image}`;

const finalResult = {
    ...result2[0],
    itemImage1: modifiedImage
};


                    const result = {
                        outerResult: result1[0],
                        innerResult: finalResult,
                        graphResult: result3,
                        adminPowerResult: adminPowerResult[0]
                    };
                    res.json({ result: result });
                });
            });
        });
    });
});

app.post('/adminPage/productInsert', upload.fields([{ name: 'Image1', maxCount: 1 }, { name: 'Image2', maxCount: 1 },{ name: 'Image3', maxCount: 1 }]), function (req, res) {
    const addPower = "SELECT addPower FROM admin WHERE adminId=?";
    const adminIdentity = req.session.adminDetails.adminId;
    con.query(addPower, [adminIdentity], (error, result) => {
        if (error) {
            console.error(error);
            return res.status(500).send("Internal Server Error");
        }
        
        if (result[0].addPower === 1) {
            const { Id, Name, Price, Quantity, Comment, category } = req.body;
            const uploadedFiles = req.files;

// Access the file buffers for each uploaded file
const imageBlob1 = uploadedFiles['Image1'][0].buffer;
const imageBlob2 = uploadedFiles['Image2'][0].buffer;
var imageBlob3;
if (uploadedFiles['Image3'] && uploadedFiles['Image3'].length > 0) {
    imageBlob3 = uploadedFiles['Image3'][0].buffer;
} else {
    imageBlob3 = null; 
}

            const check = "SELECT * FROM product WHERE itemID=?";
            con.query(check, [Id], function (error, result) {
                if (error) {
                    console.error(error);
                    return res.status(500).send("Internal Server Error");
                }

                if (result.length === 0) {
                    const sql = "INSERT INTO product(itemID, itemName, itemPrice, itemQuantity, itemComment, itemImage1,itemImage2,itemImage3,category) VALUES (?,?,?,?,?,?,?,?,?)";
                    con.query(sql, [Id, Name, Price, Quantity, Comment, imageBlob1,imageBlob2,imageBlob3,category], function (error, result) {
                        if (error) {
                            console.error(error);
                            return res.status(500).send("Internal Server Error");
                        }
                        res.json({ message: 'Product inserted successfully!' });
                    });
                } else {
                    console.log("Duplicate entry!!!!");
                    res.json({ message: 'Error! Duplicate Entry!' });
                }
            });
        } else {
            res.json({ message: 'You do not have authorization' });
        }
    });
});


app.get('/adminPage/addAdmin',function(req, res){
    res.sendFile(__dirname+'/frontend/addAdmin.html');
});

app.post('/adminPage/addAdmin', function(req, res) {
    const adminPower = "SELECT adminPower FROM admin WHERE adminId=?";
    const adminIdentity = req.session.adminDetails.adminId;
    con.query(adminPower, [adminIdentity], (error, result) => {
        if (error) {
            console.error(error);
            res.status(500).send("Internal Server Error");
            return;
        }
        if (result[0].adminPower === 1) {
            var Id = req.body.Id;
            var Email = req.body.Email;
            var Password = req.body.Password;
            var addPower = (req.body.addPower == 1) ? 1 : 0;
            var updatePower = (req.body.updatePower == 1) ? 1 : 0;
            var adminPower = (req.body.adminPower == 1) ? 1 : 0;

            var salt = 10;

            bcrypt.hash(Password, salt, function(hashError, hash) {
                if (hashError) {
                    console.error('Error hashing password:', hashError);
                    res.status(500).send("Internal Server Error");
                    return;
                }
                var sql = "INSERT INTO admin(adminId,adminEmail,adminPassword,addPower,updatePower,adminPower) VALUES (?,?,?,?,?,?)";
                con.query(sql, [Id, Email, hash, addPower, updatePower, adminPower], function(error, result) {
                    if (error) {
                        console.error(error);
                        res.status(500).send("Internal Server Error");
                        return;
                    }
                    res.json({ message: 'Admin added successfully!' });
                });
            });
        }
        else{
            res.json({ message: 'You are not authorized!!!' });
        }
    });
});




app.get('/adminPage/viewCustomer', (req, res) => {
    const query = `SELECT customer.userId,customer.customerName,customer.customerEmail,customer.customerPhone
    ,SUM(orders.TotalPrice) AS customerTotal FROM customer LEFT JOIN orders ON customer.userId=orders.userId GROUP BY customer.userId`;

    con.query(query, (error, result) => {
        if (error) {
            console.error(error);
            res.status(500).send("Internal Server Error");
            return;
        }
        res.json( { customer: result });
    });
});

app.get('/adminPage/productStocks', (req, res) => {
    const query = "SELECT itemName FROM product where itemQuantity<10";

    con.query(query, (error, result) => {
        if (error) {
            console.error(error);
            res.status(500).send("Internal Server Error");
            return;
        }
        res.json( { stocks: result });
    });
});

app.get('/logout',(req,res) =>{
    req.session.adminDetails = null;
    res.redirect('/');
})

app.get('/adminPage/productView', (req, res) => {
    
    const productQuery = "SELECT itemID,itemName,itemPrice,itemQuantity FROM product";
    const adminIdentity = req.session.adminDetails.adminId;
    const adminPowerQuery = "SELECT updatePower FROM admin WHERE adminId = ?";

    con.query(productQuery, (productError, productResult) => {
        if (productError) {
            console.error(productError);
            res.status(500).send("Internal Server Error");
            return;
        }

        // Execute the admin power query based on the session's adminId
        con.query(adminPowerQuery, [adminIdentity], (adminPowerError, adminPowerResult) => {
            if (adminPowerError) {
                console.error(adminPowerError);
                res.status(500).send("Internal Server Error");
                return;
            }

           
            const item = {
                product: productResult,
                adminPower: adminPowerResult[0] 
            };
            res.json(item);
        });
    });
});


app.get('/adminPage/updatePower', (req, res) => {

});

app.post('/adminPage/productView/update/:itemID', upload.fields([{ name: 'Image1', maxCount: 1 }, { name: 'Image2', maxCount: 1 },{ name: 'Image3', maxCount: 1 }]), function (req, res) {
    const updatePowerQuery = "SELECT updatePower FROM admin WHERE adminId=?";
    const adminIdentity = req.session.adminDetails.adminId;

    con.query(updatePowerQuery, [adminIdentity], (error, result) => {
        if (error) {
            console.error(error);
            res.status(500).send("Internal Server Error");
            return;
        }

        if (result[0].updatePower === 1) {
            const updateId = req.params.itemID;
            const updateName = req.body.Name;
            const updatePrice = req.body.Price;
            const updateQuantity = req.body.Quantity;
            console.log(updateName+updatePrice);
            const imageBlob1 = req.files['Image1'] ? req.files['Image1'][0].buffer : null;
            const imageBlob2 = req.files['Image2'] ? req.files['Image2'][0].buffer : null;
            const imageBlob3 = req.files['Image3'] ? req.files['Image3'][0].buffer : null;

            var query = "UPDATE product SET itemName = ?,itemPrice = ?,itemQuantity = ?";

            if (imageBlob1) query += ", itemImage1 = ?";
            if (imageBlob2) query += ", itemImage2 = ?";
            if (imageBlob3) query += ", itemImage3 = ?";

            query += " WHERE itemID = ?";

            const params = [updateName, updatePrice, updateQuantity];
            if (imageBlob1) params.push(imageBlob1);
            if (imageBlob2) params.push(imageBlob2);
            if (imageBlob3) params.push(imageBlob3);
            params.push(updateId);
            console.log(params);

            con.query(query, params, function (error, result) {
                if (error) {
                    con.rollback(function () {
                        console.error(error);
                        res.status(500).send("Internal Server Error");
                        return;
                    });
                }
                console.log('item vayo bhitra ekchoti!!')
                res.json({ message: 'Item updated Successfully' });
            });
        } else {
            res.json({ message: 'You are not authorized!!!' });
        }
    });
});





app.get('/adminPage/viewOrder',function(req, res){
    const query = "SELECT * FROM orders";

    con.query(query, (error, result) => {
        if (error) {
            console.error(error);
            res.status(500).send("Internal Server Error");
            return;
        }
        res.json({ item: result });
    });
});





app.listen(8000);//setting port of our website
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Internal Server Error');
});