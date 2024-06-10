var con = require('./connect'); // handling https request
var path = require('path');
var express = require('express');
var app = express();
const nodemailer = require('nodemailer');
const multer = require('multer');
const storage =multer.memoryStorage();
const upload = multer({storage:storage });
const session = require('express-session');
const body_parser = require('body-parser');
var bcrypt = require('bcrypt');

app.use(body_parser.urlencoded({ extended: false }));
app.use(body_parser.json());
app.use(express.static('public'));
app.use(express.static(path.join(__dirname, 'frontend')));
app.use(express.static(path.join(__dirname, 'frontend/user-login-page')));
app.use(express.static(path.join(__dirname, 'frontend/product')));
app.use(express.static(path.join(__dirname, 'frontend/product/individual-product')));

app.use(session({
    secret: 'bipin123', 
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 30* 24 * 60 * 60 * 1000 } 
}));

const crypto = require('crypto');

function generateRandomCode(length) {
    let code = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, characters.length);
      code += characters.charAt(randomIndex);
    }
  
    return code;
  }
  
  // Function to generate and store random code in session
  function generateAndStoreRandomCode(req) {
    const code = generateRandomCode(6);
    req.session.randomCode = code;
  }
  
  // Generate and store random code initially
  app.use((req, res, next) => {
    if(!req.session.randomCode){
    generateAndStoreRandomCode(req);
    }
    next();
  });
  
 
app.get('/', function (req, res) {
    res.sendFile(__dirname + "/frontend/customerIndex.html");
});

app.get('/register', function (req, res) {
    res.sendFile(__dirname + "/frontend/register.html");
});

app.get('/product', function (req, res) {
    res.sendFile(__dirname + "/frontend/product/product.html");
});

app.get('/productInfo', (req, res) => {
    if (req.session.customerDetails) {
        const customerDetails = req.session.customerDetails;
        console.log('Welcome, ' + customerDetails.customerName);
    } else {
        console.log('User details not found. Please log in.');
    }
    
    const query = "SELECT itemID, itemName, itemPrice, itemImage1,itemQuantity,category FROM product";

    con.query(query, (error, result) => {
        if (error) {
            console.error(error);
            res.status(500).send("Internal Server Error");
            return;
        }
        const finalResult = result.map(product => {
            const image1Buffer = product.itemImage1; 
            const base64Image = Buffer.from(image1Buffer).toString('base64');
            const modifiedImage = `data:image/png;base64,${base64Image}`;
        
            return {
                ...product,
                itemImage1: modifiedImage
            };
        });

        
        res.json( { product: finalResult });
    });
});

app.post('/uploadUserImage', upload.single('userImage'), function (req, res) {
    if (req.session.customerDetails) {
        const customerId = req.session.customerDetails.userIdentity;
        const image =req.file;
        if (typeof image === 'undefined') {
        }
        else{
        const imageBlob = image.buffer;
        
        var query = `UPDATE customer SET customerImage=? WHERE userId=?`;
        var secondQuery = `SELECT customerImage from customer WHERE userId=?`;
        
        con.query(query, [imageBlob, customerId], (error, result) => {
            if (error) {
                console.error(error);
                return res.status(500).send("Internal Server Error");
            }
            
            con.query(secondQuery, [customerId], (error, result) => {
                if (error) {
                    console.error(error);
                    return res.status(500).send("Internal Server Error");
                }
                
                if (result.length > 0 && result[0].customerImage !== null) {
                    const base64Image = Buffer.from(result[0].customerImage).toString('base64');
                    const modifiedImage = `data:image/png;base64,${base64Image}`;
                    
                    // Update session with the modified image
                    req.session.customerDetails.customerImage = modifiedImage;
                }
                
                res.json({ message: "User Image updated successfully" });
            });
        });
    }
    } else {
        console.log('User details not found. Please log in.');
        res.status(401).send("User details not found. Please log in.");
    }

});




app.post('/cart', function (req, res) {
    var Id = req.body.productID;
    var Quantity = parseInt(req.body.userProductQuantity);
    
    if (req.session.customerDetails) {
        const customerDetails = req.session.customerDetails;
        var userId = customerDetails.userIdentity;
        var infoQuery =`SELECT itemName,itemPrice,itemQuantity from product WHERE itemID=? `;
        // Check if the product already exists in the cart
        var selectQuery = `SELECT productId,productQuantity FROM cart WHERE productId = ? AND userId=? and status="Not Purchased"`;
         con.query(infoQuery, [Id, userId], function (error, result) {
            if (error) {
                console.error(error);
                res.status(500).send("Internal Server Error");
                return;
            }
            Price=result[0].itemPrice;
            Name=result[0].itemName;
            ExistingQuantity=parseInt(result[0].itemQuantity);
        con.query(selectQuery, [Id, userId], function (error, result) {
            if (error) {
                console.error(error);
                res.status(500).send("Internal Server Error");
                return;
            }

            if (result.length > 0) {
                
                if(ExistingQuantity<parseInt(result[0].productQuantity)+Quantity){
                    res.json({message:"You have exceed the amount available in stock!"})
                }
                else{
                var updateQuantityQuery = "UPDATE cart SET productQuantity = productQuantity + ? WHERE productId = ? AND userId=?";
                con.query(updateQuantityQuery, [Quantity, Id, userId], function (error, result) {
                    if (error) {
                        console.error(error);
                        res.status(500).send("Internal Server Error");
                        return;
                    }
                    res.json({message:'Product quantity updated in the cart.'});
                });
            }
            } else {
                // Product does not exist in the cart, insert a new row
                var insertQuery = "INSERT INTO cart(productId, productName, productQuantity, productPrice, userId) VALUES ( ?, ?, ?, ?, ?)";
                con.query(insertQuery, [Id, Name, Quantity, Price,userId], function (error, result) {
                    if (error) {
                        console.error(error);
                        res.status(500).send("Internal Server Error");
                        return;
                    }
                    res.json({message: 'Product added to the cart.'});
                });
            }
        });
    });
    } else {
        console.log('User details not found. Please log in.');
        res.redirect('/login');
    }
});


app.post('/cartView', (req, res) => { 
        if (req.session.customerDetails) {
            const customerDetails = req.session.customerDetails;
            const userId = customerDetails.userIdentity;
            
            const query = `SELECT cart.*, product.itemImage1,product.itemQuantity 
            FROM cart 
            JOIN product ON cart.productId = product.itemID 
            WHERE userId = ? AND status="Not Purchased";
            `;
            con.query(query, [userId], (error, result) => {
                if (error) {
                    console.error(error);
                    res.status(500).send("Internal Server Error");
                    return;
                }
                for (let i = 0; i < result.length; i++) {
                    const imageBuffer = result[i].itemImage1; // Assuming the column name for image data is itemImage1
                    const base64Image = Buffer.from(imageBuffer).toString('base64');
                    const modifiedImage = `data:image/png;base64,${base64Image}`;
                    
                    // Update the itemImage1 property in the result array
                    result[i].itemImage1 = modifiedImage;
                }
                
                res.json({ item: result });
            });
        } else {
            res.redirect('/login');
        }        
});


app.get('/profile', function (req, res) {
    res.sendFile(__dirname+'/frontend/profile.html');
});
app.get('/reservation', function (req, res) {
    res.sendFile(__dirname+'/frontend/reservation/reservation.html');
});

app.get('/cartView', function (req, res) {
    res.sendFile(__dirname+'/frontend/user-cart.html');
});

app.get('/purchase', (req, res) => {
    let userId;

    if (req.session.customerDetails) {
        const customerDetails = req.session.customerDetails;
        userId = customerDetails.userIdentity;
    } else {
        console.log('User details not found. Please log in.');
        res.redirect('/login');
        return;
    }

    // Start transaction
    con.beginTransaction(err => {
        if (err) {
            console.error('Error beginning transaction:', err);
            res.status(500).send("Internal Server Error");
            return;
        }
        console.log("Beginning the transaction");
        var checkQuantity = `SELECT product.itemQuantity as itemQuantity, cart.productQuantity as productQuantity FROM product INNER JOIN cart ON product.itemID = cart.productId WHERE cart.userId = ? AND cart.status= "Not Purchased"`;
        con.query(checkQuantity, [userId], (error, products) => {
            if (error) {
                console.error(error);
                // Rollback transaction on error
                con.rollback(() => {
                    res.status(500).send("Internal Server Error");
                });
                return;
            }
            console.log("Beginning to check stock");
            
            for (let i = 0; i < products.length; i++) {
                if (products[i].itemQuantity < products[i].productQuantity) {
                    // Rollback transaction on insufficient quantity
                    con.rollback(() => {
                        console.log("product of"+i+"is insufficient");
                        console.log(products[i].itemQuantity);
                        console.log(products[i].productQuantity);
                        
                        res.json({i,message: "Product is not available in that many quantity"});
                    });
                    return;
                }
            }
            console.log("Getting customer orders");
            var checkOrder = 'SELECT *,productPrice*productQuantity as total FROM cart WHERE userId = ? AND cart.status="Not Purchased"';
            con.query(checkOrder, [userId], (error, cartItems) => {
                if (error) {
                    console.error(error);
                    // Rollback transaction on error
                    con.rollback(() => {
                        res.status(500).send("Internal Server Error");
                    });
                    return;
                }
                console.log("Saving customer orders");
                for (let i = 0; i < cartItems.length; i++) {
                    var insertOrder = 'INSERT INTO orders(userId,productId, Quantity, totalPrice, TimeStamp) VALUES (?,?,?,?,NOW())';
                    con.query(insertOrder, [userId, cartItems[i].productId, cartItems[i].productQuantity, cartItems[i].total], (insertError, insertResult) => {
                        if (insertError) {
                            console.error(insertError);
                            // Rollback transaction on error
                            con.rollback(() => {
                                res.status(500).send("Internal Server Error");
                            });
                            return;
                        }
                    });
                }
                console.log("Updating product quantity");
                const purchaseOrder = 'UPDATE product INNER JOIN cart ON product.itemID = cart.productId SET product.itemQuantity = product.itemQuantity - cart.productQuantity WHERE cart.userId = ? AND cart.status="Not Purchased"';
                con.query(purchaseOrder, [userId], (updateError, updateResult) => {
                    if (updateError) {
                        console.error(updateError);
                        // Rollback transaction on error
                        con.rollback(() => {
                            res.status(500).send("Internal Server Error");
                        });
                        return;
                    }
                    console.log("Updating cart info");
                    const deleteQuery = 'UPDATE cart SET status="Purchased" WHERE userId = ?';
                    con.query(deleteQuery, [userId], (deleteError, deleteResult) => {
                        if (deleteError) {
                            console.error(deleteError);
                            // Rollback transaction on error
                            con.rollback(() => {
                                res.status(500).send("Internal Server Error");
                            });
                            return;
                        }

                        // Commit transaction if everything is successful
                        con.commit((commitError) => {
                            if (commitError) {
                                console.error('Error committing transaction:', commitError);
                                res.status(500).send("Internal Server Error");
                                return;
                            }

                            res.json({message:"You have successfully purchased!!"});
                        });
                    });
                });
            });
        });
    });
});


app.get('/register', function (req, res) {
     res.sendFile(__dirname+'/frontend/register.html');
});

app.post('/register', function (req, res) {
    var check = "SELECT * FROM customer WHERE customerEmail = ? OR customerPhone = ?";
    const insertQuery = "INSERT INTO customer(customerName, customerPassword, customerEmail, customerPhone) VALUES (?, ?, ?, ?)";
    
    var userName = req.body.regname;
    var email = req.body.regemail;
    var password = req.body.regpass;
    var phone = req.body.regnum;
    var salt = 10;

    con.query(check, [email, phone], function (checkError, checkResult) {
        if (checkError) {
            console.error('Error checking existing email or phone:', checkError);
            res.status(500).send("Internal Server Error");
            return;
        }

        if (checkResult.length > 0) {
            res.status(409).json({message: "Email or phone already in use."});
        } else {
            bcrypt.hash(password, salt, function (hashError, hash) {
                if (hashError) {
                    console.error('Error hashing password:', hashError);
                    res.status(500).send("Internal Server Error");
                    return;
                }

                con.query(insertQuery, [userName, hash, email, phone], function (insertError, result) {
                    if (insertError) {
                        console.error('Error inserting user:', insertError);
                        res.status(500).send("Internal Server Error");
                        return;
                    }

                    res.json({message: "Registration successful."});
                });
            });
        }
    });
});



app.get('/login', function (req, res) {
    res.sendFile(__dirname+'/frontend/user-login-page/login-page.html');
});

app.post('/login', function (req, res) {
    const query = "SELECT customerName, userId, customerPassword,customerPhone,customerImage FROM customer WHERE customerEmail=?";
    
    var email = req.body.idValue; 
    var password = req.body.passwordValue; 

    
    con.query(query, [email], function (error, result) { 
        if (error) {
            console.error(error);
            res.status(500).send("Internal Server Error");
            return;
        } else if (result.length > 0) {
            bcrypt.compare(password, result[0].customerPassword, function(err, match) {
                if (err) {
                    console.error('Error comparing passwords:', err);
                } else {
                    if (match) {
                        console.log('Password matches!');
                        if (result[0].customerImage!=null){
                        const base64Image = Buffer.from(result[0].customerImage).toString('base64');
                        result[0].customerImage = `data:image/png;base64,${base64Image}`;
                        }
                        const customerDetails = {
                            userIdentity: result[0].userId,
                            customerName: result[0].customerName,
                            customerEmail: email,
                            customerPhone: result[0].customerPhone,
                            customerImage: result[0].customerImage // Assign the Base64 representation of the image
                        };
                        req.session.customerDetails = customerDetails;
                        res.redirect('/');
                    } else {
                        res.json({message:"Incorrect Credentials!!"})
                    }
                }
            });   
        }
        else {
            res.json({message:"Incorrect Credentials:"})
        }
    });
});
var productId;
app.get('/individualProduct', function (req, res){
    
    if(req.query.productId){
    productId = req.query.productId;
    res.sendFile(__dirname+'/frontend/individual-product/individual-product.html');  
}
else
{
    const query = "SELECT * FROM product WHERE itemID = ?";
    
    con.query(query, [productId],function (error, result) {
        if (error) {
            console.error(error);
            res.status(500).send("Internal Server Error");
            return;
        }
        if (result.length > 0) {
            for (let i = 1; i <= 3; i++) {
                const imageKey = `itemImage${i}`;
                if (result[0][imageKey] !== null) {
                    const base64Image = Buffer.from(result[0][imageKey]).toString('base64');
                    result[0][imageKey] = `data:image/png;base64,${base64Image}`;
                }
            }
        } 
         res.json(result);
    });
}
});


app.post('/delete/:itemID', function (req, res) {
    let userId;

    if (req.session.customerDetails) {
        const customerDetails = req.session.customerDetails;
        userId = customerDetails.userIdentity;
    } else {
        console.log('User details not found. Please log in.');
        res.redirect('/login');
        return;
    }
    const deleteId = req.params.itemID;
    const query = `DELETE FROM cart WHERE productId= ? and userId=? AND status="Not Purchased" `;
    
    
    con.query(query, [deleteId,userId],function (error, result) {
        if (error) {
            console.error(error);
            res.status(500).send("Internal Server Error");
            return;
        }
    });
    console.log("Item deleted Successfully");
    res.redirect('/cartView');
});

app.get('/logout', function (req, res) {
    req.session.destroy(function(err) {
        if (err) {
            console.error(err);
            res.status(500).send("Internal Server Error");
        } else {
            
            res.redirect('/'); 
        }
    });
});

app.get('/profile', function (req, res) {
    res.sendFile(__dirname+'/frontend/user-profile.html');
});

app.get('/profileInfo', function (req, res) {
    if (req.session.customerDetails) {
        res.json({ result: req.session.customerDetails });
    } else {
        res.json({result: null });
    }
});
app.post('/add/:itemID', function (req, res) {
    const userId = req.session.customerDetails?.userIdentity;

    if (!userId) {
        console.log('User details not found. Please log in.');
        return res.redirect('/login');
    }

    const deleteId = req.params.itemID;
    const query = `UPDATE cart SET productQuantity = productQuantity + 1 WHERE productId = ? AND userId = ? AND status = "Not Purchased"`;
    
    con.query(query, [deleteId, userId], function (error, result) {
        if (error) {
            console.error(error);
            return res.status(500).send("Internal Server Error");
        }
        res.redirect('/cartView');
    });
});


app.post('/subtract/:itemID', function (req, res) {
    const userId = req.session.customerDetails?.userIdentity;

    if (!userId) {
        console.log('User details not found. Please log in.');
        return res.redirect('/login');
    }

    const deleteId = req.params.itemID;
    const query = `UPDATE cart SET productQuantity = productQuantity-1 WHERE productId = ? AND userId = ? AND status = "Not Purchased"`;
    
    con.query(query, [deleteId, userId], function (error, result) {
        if (error) {
            console.error(error);
            return res.status(500).send("Internal Server Error");
        }
    });

    res.redirect('/cartView');
});

app.get('/cartTotal', function (req, res) {
    const userId = req.session.customerDetails?.userIdentity;

    if (!userId) {
        console.log('User details not found. Please log in.');
        return res.redirect('/login');
    }

    
    const query = `SELECT SUM(productQuantity) AS total FROM cart WHERE userId = ? AND status = "Not Purchased"`;
    
    con.query(query, [userId], function (error, result) {
        if (error) {
            console.error(error);
            return res.status(500).send("Internal Server Error");
        }
        res.json({result: result[0].total});
    });
});

app.post('/forgotPassword', (req, res) => {
   var UserEmail = req.body.recoveryemail;
   const query = `SELECT userId FROM customer WHERE customerEmail=?`;
    
    con.query(query, [UserEmail], function (error, result) {
        if (error) {
            console.error(error);
            return res.status(500).send("Internal Server Error");
        }
        if( result[0]!==undefined){
    
    // Create a transporter object using the default SMTP transport
    let transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com', // Your SMTP server hostname
        port: 465, 
        secure: true, 
        auth: {
            user: 'bipinrana970@gmail.com', 
            pass: 'xtfj kblz majd zxal' 
        }
    });
    
    // Setup email data
    let mailOptions = {
        from: '"Golden Studio" <studiogoldenmakeup@gmail.com>',
        to:    `${UserEmail}`,
        subject: 'Verification code',
        text: `Please enter this to reset your password: \n\n ${req.session.randomCode}.`
    };

    // Send mail
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending email:', error);
            res.status(500).send('Error sending email');
        } else {
           res.json({message:'Verification code sent!'});
        }
    });}
    else{
        res.json({message:'This email is not registered!!!'});
    }
});
});

app.get('/viewOrder', function (req, res) {
    const userId = req.session.customerDetails?.userIdentity;

    if (!userId) {
        console.log('User details not found. Please log in.');
        return res.redirect('/login');
    }

    
    const query = `SELECT orders.orderId,product.itemName,orders.Quantity,product.itemPrice,orders.TimeStamp FROM orders join product on orders.productId=product.itemID  WHERE userId = ?`;
    
    con.query(query, [userId], function (error, result) {
        if (error) {
            console.error(error);
            return res.status(500).send("Internal Server Error");
        }
        res.json({item: result});
    });
});


app.post('/verify', function (req, res) {
    var UserPass = req.body.recoverypassword;
    console.log(req.session.randomCode);
    console.log(UserPass);
    if(UserPass===req.session.randomCode){
        res.json({message:'Correct Password'});
    }
    else{
        res.json({message:'Incorrect Password'});
    }
});

app.post('/create', function (req, res) {
    
    const insertQuery = "UPDATE customer SET customerPassword=? where customerEmail=?";
   
    var email = req.body.email;
    var password = req.body.newpassword;
    var salt = 10;

   
            bcrypt.hash(password, salt, function (hashError, hash) {
                if (hashError) {
                    console.error('Error hashing password:', hashError);
                    res.status(500).send("Internal Server Error");
                    return;
                }

                con.query(insertQuery, [ hash, email], function (insertError, result) {
                    if (insertError) {
                        console.error('Error inserting user:', insertError);
                        res.status(500).send("Internal Server Error");
                        return;
                    }

                    res.json({message: "Password recovery successful."});
                });
            });
   
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});