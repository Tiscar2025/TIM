"""Routes for login view."""
from .common import *
from .logger import log_message
from email.mime.text import MIMEText
from flask import Blueprint, flash, redirect, render_template, request, url_for

import codecs
import os
import smtplib
import string
import random
import re
import requests
import requests.exceptions
import socket


login_page = Blueprint('login_page',
                        __name__,
                        url_prefix='')  # TODO: Better URL prefix.

def __getRealName(email):
    atindex = email.index('@')
    if atindex <= 0:
        return email
    parts = email[0:atindex].split('.')
    parts2 = [part.capitalize() if len(part) > 1 else part.capitalize() + '.' for part in parts]
    return ' '.join(parts2)
    
def __isValidEmail(email):
    return re.match('^[\w\.-]+@([\w-]+\.)+[\w-]+$', email) is not None

def __sendMail(email, subject, text, sender='no-reply@tim.it.jyu.fi'):
    # Check connectivity first
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(3)
    sock.connect(('smtp.jyu.fi', 25))
    sock.close()

    msg = MIMEText(text)
    msg['Subject'] = subject
    msg['From'] = sender
    msg['To'] = email

    s = smtplib.SMTP('smtp.jyu.fi')
    s.sendmail(sender, [email], msg.as_string())
    s.quit()


@login_page.route("/logout", methods=['POST'])
def logout():
    session.pop('user_id', None)
    session.pop('user_name', None)
    session.pop('email', None)
    session.pop('real_name', None)
    session.pop('appcookie', None)
    session.pop('altlogin', None)
    session.pop('came_from', None)
    session.pop('last_doc', None)
    session.pop('anchor', None)
    session['user_name'] = 'Anonymous'
    return redirect(url_for('start_page'))


@login_page.route("/login")
def login():
    save_came_from()
    if logged_in():
        flash('You are already logged in.')
        return safe_redirect(session.get('came_from', '/'))
    if request.args.get('korppiLogin'):
        return login_with_korppi()
    elif request.args.get('emailLogin'):
        return loginWithEmail()
    elif request.args.get('emailSignup'):
        return signupWithEmail()
    else:
        return render_template('loginpage.html',
                               hide_require_text=True,
                               anchor=request.args.get('anchor'))


@login_page.route("/korppiLogin")
def login_with_korppi():
    urlfile = request.url_root + "korppiLogin"
    save_came_from()

    if not session.get('appcookie'):
        random_hex = codecs.encode(os.urandom(24), 'hex').decode('utf-8')
        session['appcookie'] = random_hex
    url = "https://korppi.jyu.fi/kotka/interface/allowRemoteLogin.jsp"
    try:
        r = requests.get(url, params={'request': session['appcookie']}, verify=True)
    except requests.exceptions.SSLError:
        return render_template('503.html', message='Korppi seems to be down, so login is currently not possible. '
                                                   'Try again later.'), 503
    
    if r.status_code != 200:
        return render_template('503.html', message='Korppi seems to be down, so login is currently not possible. '
                                                   'Try again later.'), 503
    korppi_response = r.text.strip()
    if not korppi_response:
        return redirect(url+"?authorize=" + session['appcookie'] + "&returnTo=" + urlfile, code=303)
    pieces = (korppi_response + "\n\n").split('\n')
    user_name = pieces[0]
    real_name = pieces[1]
    email = pieces[2]

    timdb = getTimDb()
    user_id = timdb.users.get_user_by_name(user_name)
    
    if user_id is None:
        # Try email
        user = timdb.users.get_user_by_email(email)
        if user is not None:
            # An email user signs in using Korppi for the first time. We update the user's username and personal
            # usergroup.
            user_id = user['id']
            group_id = timdb.users.get_personal_usergroup(user)
            timdb.users.update_user(user_id, user_name, real_name, email)
            timdb.users.add_user_to_korppi_group(user_id)
            timdb.users.set_usergroup_name(group_id, user_name)
        else:
            uid = timdb.users.create_user(user_name, real_name, email)
            gid = timdb.users.create_usergroup(user_name)
            timdb.users.add_user_to_group(gid, uid)
            timdb.users.add_user_to_korppi_group(uid)
            user_id = uid
    else:
        if real_name:
            timdb.users.update_user(user_id, user_name, real_name, email)

    session['user_id'] = user_id
    session['user_name'] = user_name
    session['real_name'] = real_name
    session['email'] = email

    return finishLogin()


def loginWithEmail():
    if ('altlogin' in session and session['altlogin'] == 'login'):
        session.pop('altlogin', None)
    else:
        session['altlogin'] = "login"

    return safe_redirect(session.get('came_from', '/'))


def signupWithEmail():
    if ('altlogin' in session and session['altlogin'] == 'signup'):
        session.pop('altlogin', None)
    else:
        session['altlogin'] = "signup"

    return safe_redirect(session.get('came_from', '/'))

@login_page.route("/altsignup", methods=['POST'])
def altSignup():
    # Before password verification
    email = request.form['email']
    if not email or not __isValidEmail(email):
        flash("You must supply a valid email address!")
        return finishLogin(ready=False)
        
    password = ''.join(random.choice(string.ascii_uppercase + string.digits) for _ in range(6))
    
    timdb = getTimDb()
    timdb.users.create_potential_user(email, password)
    
    #print("Signup: email {}, password {}".format(email, password))
    session.pop('altlogin', None)
    session.pop('user_id', None)
    session.pop('appcookie', None)
    session['user_name'] = 'Anonymous'
    session["email"] = email

    try:
        __sendMail(email, 'Your new TIM password', 'Your password is {}'.format(password))
        flash("A password has been sent to you. Please check your email.")
    except Exception as e:
        log_message('Could not send login email (user: {}, password: {}, exception: {})'.format(email, password, str(e)), 'ERROR')
        flash('Could not send the email, please try again later. The error was: {}'.format(str(e)))

    return finishLogin(ready=False)

@login_page.route("/altsignup2", methods=['POST'])
def altSignupAfter():
    # After password verification
    userId = 0
    realName = request.form['realname']
    email = session['email']
    userName = email
    oldpass = request.form['token']
    password = request.form['password']
    confirm = request.form['passconfirm']
    save_came_from()
    timdb = getTimDb()

    if not timdb.users.test_potential_user(email, oldpass):
        return jsonResponse({'message': 'Authentication failure'}, 403)

    if timdb.users.get_user_by_email(email) is not None:
        # User with this email already exists
        user_data = timdb.users.get_user_by_email(email)
        userId = user_data['id']
        nameId = timdb.users.get_user_by_name(userName)

        if nameId is not None and nameId != userId:
            flash('User name already exists. Please try another one.', 'loginmsg')
            return finishLogin(ready=False)

        # Use the existing user name; don't replace it with email
        userName = user_data['name']
    else:
        if timdb.users.get_user_by_name(userName) is not None:
            flash('User name already exists. Please try another one.', 'loginmsg')
            return finishLogin(ready=False)
    
    if password != confirm:
        flash('Passwords do not match.', 'loginmsg')
        return finishLogin(ready=False)
        
    if len(password) < 6:
        flash('A password should contain at least six characters.', 'loginmsg')
        return finishLogin(ready=False)
    
    if userId == 0:
        userId = timdb.users.create_user(userName, realName, email, password=password)
        gid = timdb.users.create_usergroup(userName)
        timdb.users.add_user_to_group(gid, userId)
    else:
        timdb.users.update_user(userId, userName, realName, email, password=password)
    
    timdb.users.delete_potential_user(email)
    
    session.pop('altlogin', None)
    session['user_id'] = userId
    session['user_name'] = userName
    session['real_name'] = realName
    return finishLogin()

@login_page.route("/altlogin", methods=['POST'])
def altLogin():
    save_came_from()
    email = request.form['email']
    password = request.form['password']
    timdb = getTimDb()

    if timdb.users.test_user(email, password):
        # Registered user
        user = timdb.users.get_user_by_email(email)
        session.pop('altlogin', None)
        session['user_id'] = user['id']
        session['user_name'] = user['name']
        session['real_name'] = user['real_name']
        session['email'] = user['email']

        # Check if the users' group exists
        if (len(timdb.users.get_usergroups_by_name(user['name'])) == 0):
            gid = timdb.users.create_usergroup(user['name'])
            timdb.users.add_user_to_group(gid, user['id'])

        return finishLogin()

    elif timdb.users.test_potential_user(email, password):
        # New user
        session['user_id'] = 0
        session['user_name'] = email
        session['real_name'] = __getRealName(email)
        session['email'] = email
        session['altlogin'] = 'signup2'
        session['token'] = password
        
    else:
        flash("Email address or password did not match. Please try again.", 'loginmsg')
    
    return finishLogin(ready=False)

@login_page.route("/testuser")
@login_page.route("/testuser/<path:anything>")
def testuser(anything=None):
    flash("Testuser route has been removed; please sign up using email.")
    return redirect(url_for('index_page'))


def save_came_from():
    came_from = request.args.get('came_from') or request.form.get('came_from')
    if came_from:
        session['came_from'] = came_from
        session['last_doc'] = came_from
    else:
        session['came_from'] = session.get('last_doc', '/')
    session['anchor'] = request.args.get('anchor') or request.form.get('anchor') or ''


def finishLogin(ready=True):
    anchor = session.get('anchor', '')
    if anchor:
        anchor = "#" + anchor
    came_from = session.get('came_from', '/')
    return safe_redirect(came_from + anchor)


@login_page.route("/quickLogin/<username>")
def quickLogin(username):
    """A debug helping method for logging in as another user.
       For developer use only.
    """
    timdb = getTimDb()
    if not timdb.users.has_admin_access(getCurrentUserId()):
        abort(403)
    user = timdb.users.get_user_by_name(username)
    if user is None:
        abort(404, 'User not found.')
    user = timdb.users.get_user(user)
    session['user_id'] = user['id']
    session['user_name'] = user['name']
    session['real_name'] = user['real_name']
    session['email'] = user['email']
    flash("Logged in as: {}".format(username))
    return redirect(url_for('index_page'))
