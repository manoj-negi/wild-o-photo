import pool from "../db";
import bcrypt from "bcrypt";
import { Request, Response } from "express";
import { RowDataPacket } from "mysql2";
interface PasswordRow extends RowDataPacket {
    password_hash: string;
}

interface SignupBody {
    username: string;
    role: string;
    email: string;
    password: string;
}
interface LoginBody{
  
    email : string;
    password: string;
}

interface RoleRow {
    id: number;
    name: string;
}

const signup = async (
    req: Request<{}, {}, SignupBody>,
    res: Response
) => {
    try {
        const {
            username, role, email, password } = req.body;

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Find role ID
        const [rows] = await pool.query(
            "SELECT id, name FROM roles WHERE name = ?",[role]);

        const roleRows = rows as RoleRow[];

        if (roleRows.length === 0) {
            return res.status(400).json({
                error: "Role not found"
            });
        }

        const roleId = roleRows[0].id;

        // Create user
        await pool.query(
            `INSERT INTO users
            (username, role_id, email, password_hash)
            VALUES (?, ?, ?, ?)`,
            [username, roleId, email, passwordHash]);

        // Signup successful
        res.redirect("/admin/login");

    } catch (err: unknown) {

        if (err instanceof Error) {
            res.status(500).json({
                error: err.message
            });
        } else {
            res.status(500).json({
                error: "Something went wrong"
            });
        }
    }
};


const login = async (
     req: Request<{}, {}, LoginBody>,
    res: Response
) => {

    try{
   const {email, password} = req.body;

        const [adminData] = await pool.query<PasswordRow[]>(
    "SELECT u.password_hash, u.id, r.name AS role_name FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE email = ?",
    [email]
);
          
          if (adminData.length === 0) {
              return res.status(401).send("Invalid email or password");
}
         const hashPassword = adminData[0].password_hash
       
        const isPasswordCorrect =  bcrypt.compareSync(password, hashPassword);

        if(isPasswordCorrect){
         
        req.session.userId = adminData[0].id;
        req.session.role = adminData[0].role_name;

              res.redirect("/admin/photos")
        } else{
            res.send("wrong password!")
        }


    } catch (err: unknown) {

        if (err instanceof Error) {
            res.status(500).json({
                error: err.message
            });
        } else {
            res.status(500).json({
                error: "Something went wrong"
            });
        }
    }




};

const logout = (req: Request, res: Response)=>{

  req.session.destroy((err)=>{
    if(err){
        return res.status(500).send("could not log out")
    }
    res.clearCookie("connect.sid");
    res.redirect("/admin/login")
  } );
}

export default {
    signup,
    login,
    logout
};