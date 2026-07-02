---
title: "0.学习使用 golang 连接 postgresql 数据库"
date: "2025-11-8"
tags: ["golang", "postgresql", "pgx", "baseful"]
excerpt: "我将演示如何使用 golang 连接 PG 并对其进行基本操作"
---

# 学习使用 golang 连接 postgresql 数据库

0. 安装postgresql· [PostgreSQL: 下载 - PostgreSQL 数据库](https://postgresql.ac.cn/download/)· 个人更推荐再wsl中使用容器工具启动PG，减少开发环境的污染

1. 创建数据库goForTrain

2. source sql

3. 创建表结构

   ```sql
   -- 用户表
   CREATE TABLE users (
       id SERIAL PRIMARY KEY,
       username VARCHAR(50) UNIQUE NOT NULL,
       email VARCHAR(100) UNIQUE NOT NULL,
       full_name VARCHAR(100),
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   
   -- 课程/训练项目表
   CREATE TABLE courses (
       id SERIAL PRIMARY KEY,
       title VARCHAR(100) NOT NULL,
       description TEXT,
       duration_minutes INT CHECK (duration_minutes > 0),
       difficulty_level VARCHAR(20) CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced'))
   );
   
   -- 训练记录表
   CREATE TABLE training_records (
       id SERIAL PRIMARY KEY,
       user_id INT REFERENCES users(id) ON DELETE CASCADE,
       course_id INT REFERENCES courses(id) ON DELETE CASCADE,
       completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       score NUMERIC(5,2) CHECK (score >= 0 AND score <= 100)
   );
   ```

4. 插入测试数据

   - users

   ```sql
   INSERT INTO users (username, email, full_name) VALUES
   ('alice', 'alice@example.com', 'Alice Johnson'),
   ('bob', 'bob@example.com', 'Bob Smith'),
   ('carol', 'carol@example.com', 'Carol Lee'),
   ('david', 'david@example.com', 'David Wang');
   ```

   - courses

   ```sql
   INSERT INTO courses (title, description, duration_minutes, difficulty_level) VALUES
   ('晨跑基础', '适合初学者的30分钟慢跑训练', 30, 'beginner'),
   ('力量训练入门', '使用自身体重进行核心力量训练', 45, 'beginner'),
   ('高强度间歇训练', '20分钟HIIT燃脂训练', 20, 'intermediate'),
   ('马拉松准备', '为半马或全马做准备的长距离训练', 90, 'advanced'),
   ('瑜伽放松', '训练后的拉伸与呼吸调节', 25, 'beginner');
   ```

   - training_records

   ```sql
   INSERT INTO training_records (user_id, course_id, completed_at, score) VALUES
   (1, 1, '2025-10-01 07:30:00', 88.5),
   (1, 2, '2025-10-03 18:00:00', 92.0),
   (2, 1, '2025-10-02 06:45:00', 76.0),
   (2, 3, '2025-10-04 19:15:00', 85.5),
   (3, 4, '2025-10-05 08:00:00', 95.0),
   (4, 5, '2025-10-06 20:00:00', 90.0),
   (1, 3, '2025-10-07 17:30:00', 89.0),
   (3, 2, '2025-10-08 18:20:00', 87.5);
   ```

5. *可选* 测试查询

   ```sql
   -- 查看所有用户
   SELECT * FROM users;
   
   -- 查看所有课程
   SELECT * FROM courses;
   
   -- 查看训练记录（带用户名和课程名）
   SELECT 
       u.username,
       c.title AS course,
       tr.completed_at,
       tr.score
   FROM training_records tr
   JOIN users u ON tr.user_id = u.id
   JOIN courses c ON tr.course_id = c.id
   ORDER BY tr.completed_at;
   ```
   
6. 初始化项目并安装 pgx 库

    ```bash
    mkdir goForPG
    cd goForPG
    go mod init
    go get github/jackc/pgx/v5
    vim main.go
    ```

7. 使用连接字符串创建连接对象

    ```go
    conn, err := pgx.Connect(context.Background(), "postgres://postgres:password@your_DB_host:5432/goForTrain")
    if err != nil {
        fmt.Println("connection error:", err)
        return
    }
    fmt.Println("connection successful")
    ```

8. 定义一个数据类型User

   ```go
   type User struct {
   	Id        int64
   	Username  string
   	Email     string
   	FullName  string
   	CreatedAt time.Time
   }
   ```

9. 创建一个插入用户的函数

   ```go
   func AddUser(ctx context.Context, user User, conn *pgx.Conn) error {
   	tx, err := conn.Begin(ctx)//创建事物
   	if err != nil {
   		return err
   	}
   	defer tx.Rollback(ctx)
   
   	_, err = tx.Exec(ctx, "INSERT INTO users(username, email, full_name, created_at) values($1, $2, $3, $4)", user.Username, user.Email, user.FullName, user.CreatedAt)
   	if err != nil {
   		return err
   	}
   	if err := tx.Commit(ctx); err != nil {
   		return err
   	}
   	defer tx.Commit(ctx)//提交事务
   	return nil
   }
   ```

10. 创建一个查询所有用户的函数

       ```go
       func GetAllUsers(ctx context.Context, conn *pgx.Conn) ([]User, error) {
        rows, err := conn.Query(context.Background(), "SELECT * FROM users")//返回用户表所有行
        if err != nil {
            fmt.Println("query error:", err)
            return nil, err
        }
        defer rows.Close()
        users, err := pgx.CollectRows(rows, pgx.RowToStructByName[User])//将结果集塞入user切片users
        if err != nil {
            return nil, err
        }
        return users, nil
       }
       ```

11. 在main中调用它们

   ```go
   func main() {
   	conn, err := pgx.Connect(context.Background(), "postgres://postgres:Password@IP/goForTrain")
   	if err != nil {
   		fmt.Println("connection error:", err)
   		return
   	}
   	fmt.Println("connection successful")
   
   	if err := AddUser(context.Background(), User{
   		Username:  "kami",
   		Email:     "kami@kami.kami",
   		FullName:  "Kami zhenxia",
   		CreatedAt: time.Now(),
   	}, conn); err != nil {//定义需要插入的数据并调用插入user的函数
   		fmt.Println("add user error:", err)
   		return
   	}
   
   	users, err := GetAllUsers(context.Background(), conn)//查询所有用户
   	if err != nil {
   		fmt.Println("get users error:", err)
   		return
   	}
   	fmt.Println(users)
   
   	defer conn.Close(context.Background())
   }
   ```

12. 测试代码

   ```bash
   cd path/to/goForPG && go run main.go
   ```

   

   ![image-20251108142100579](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/image-20251108142100579.png)

可以看到最后一条记录是我们新插入的用户。
