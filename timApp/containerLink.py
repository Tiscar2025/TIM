# -*- coding: utf-8 -*-
import json
from functools import lru_cache

import requests

from timApp.documentmodel.document import Document
from timApp.documentmodel.timjsonencoder import TimJsonEncoder
from timApp.dumboclient import call_dumbo
from timApp.logger import log_warning
from timApp.plugin import PluginException
from timApp.pluginOutputFormat import PluginOutputFormat
from timApp.tim_app import app

TIM_URL = ""

CSPLUGIN_NAME = 'csplugin'
SVNPLUGIN_NAME = 'showfile'
HASKELLPLUGIN_NAME = 'haskellplugins2'
PALIPLUGIN_NAME = 'pali'
IMAGEXPLUGIN_NAME = 'imagex'

PLUGINS = {
    "csPlugin": {"host": "http://" + CSPLUGIN_NAME + ":5000/cs/"},
    "taunoPlugin": {"host": "http://" + CSPLUGIN_NAME + ":5000/cs/tauno/"},
    "simcirPlugin": {"host": "http://" + CSPLUGIN_NAME + ":5000/cs/simcir/"},
    "csPluginRikki": {"host": "http://" + CSPLUGIN_NAME + ":5000/cs/rikki/"},  # demonstrates a broken plugin
    "showCode": {"host": "http://" + SVNPLUGIN_NAME + ":5000/svn/", "browser": False},
    "showImage": {"host": "http://" + SVNPLUGIN_NAME + ":5000/svn/image/", "browser": False},
    "showVideo": {"host": "http://" + SVNPLUGIN_NAME + ":5000/svn/video/", "browser": False},
    "mcq": {"host": "http://" + HASKELLPLUGIN_NAME + ":5001/"},
    "mmcq": {"host": "http://" + HASKELLPLUGIN_NAME + ":5002/"},
    "uploader": {"host": app.config['UPLOADER_CONTAINER_URL']},
    "shortNote": {"host": "http://" + HASKELLPLUGIN_NAME + ":5003/"},
    "graphviz": {"host": "http://" + HASKELLPLUGIN_NAME + ":5004/", "browser": False},
    "pali": {"host": "http://" + PALIPLUGIN_NAME + ":5000/"},
    "imagex": {"host": "http://" + IMAGEXPLUGIN_NAME + ":5000/"},
    "qst": {"host": "http://" + "localhost" + ":{}/qst/".format(app.config['QST_PLUGIN_PORT'])},
    "echo": {"host": "http://" + "tim" + ":5000/echoRequest/", "skip_reqs": True}
}


def call_plugin_generic(plugin, method, route, data=None, headers=None, params=None):
    plug = get_plugin(plugin)
    try:
        # Alleviation for a testing problem: since qst plugin is in the same process, the live server during browser
        # test cannot process the request properly because it tries to call itself during a request.
        # By using a small timeout value, the test finishes more quickly.
        read_timeout = 30 if plugin != 'qst' else 1
        host = plug['host']
        if route == 'multimd' and (plugin == "mmcq" or plugin == "mcq"):  # hack to handle mcq and mmcq in tim by qst
            plug = get_plugin('qst')
            host = plug['host'] + plugin + '/'
        request = requests.request(method, host + route + "/", data=data,
                                   timeout=(0.5, read_timeout), headers=headers, params=params)
        request.encoding = 'utf-8'
        return request.text
    except (requests.exceptions.ConnectTimeout, requests.exceptions.ConnectionError) as e:
        log_warning('Connection failed to plugin {}: {}'.format(plugin, e))
        raise PluginException("Could not connect to {}.".format(plugin))
    except requests.exceptions.ReadTimeout as e:
        log_warning('Read timeout occurred for plugin {} in route {}: {}'.format(plugin, route, e))
        raise PluginException("Read timeout occurred when calling {}.".format(plugin))


def render_plugin(doc: Document, plugin, plugin_data, output_format: PluginOutputFormat, params=None):
    plugin_data.update(params or {})
    if doc.get_settings().plugin_md():
        convert_md(plugin_data)
    plugin_data = json.dumps(plugin_data,
                             cls=TimJsonEncoder)
    return call_plugin_generic(plugin,
                               'post',
                               output_format.value,
                               data=plugin_data,
                               headers={'Content-type': 'application/json'},
                               params=params)


def remove_p(s):
    if not s.startswith('<p>'):
        return s
    rs = s[3:]
    if not rs.endswith('</p>'):
        return s
    return rs[:-4]


def call_mock_dumbo_s(s):
    s = s.replace('`', '')
    s = s.replace('#', '\\#')
    s = s.replace('%', '\\%')
    return s


def list_to_dumbo(markup_list):
    i = 0
    for val in markup_list:
        ic = i
        i += 1
        if type(val) is dict:
            dict_to_dumbo(val)
            continue
        if type(val) is markup_list:
            list_to_dumbo(val)
            continue
        if not type(val) is str:
            continue
        if not val.startswith("md:"):
            continue

        v = val[3:]
        v = call_mock_dumbo_s(v)
        markup_list[ic] = v


def dict_to_dumbo(pm):
    for mkey in pm:
        val = pm[mkey]
        if type(val) is dict:
            dict_to_dumbo(val)
            continue
        if type(val) is list:
            list_to_dumbo(val)
            continue

        if not type(val) is str:
            continue

        if not val.startswith("md:"):
            continue
        v = val[3:]
        v = call_mock_dumbo_s(v)
        pm[mkey] = v


def convert_md_old(plugin_data):
    # return
    if type(plugin_data) is dict:
        dict_to_dumbo(plugin_data)
        return
    for p in plugin_data:
        pm = p["markup"]
        dict_to_dumbo(pm)


def convert_md(plugin_data):
    if isinstance(plugin_data, dict):
        plugin_data['markup'] = call_dumbo(plugin_data['markup'], '/mdkeys')
    elif isinstance(plugin_data, list):
        markups = [p['markup'] for p in plugin_data]
        html_markups = call_dumbo(markups, '/mdkeys')
        for p, h in zip(plugin_data, html_markups):
            p['markup'] = h


def convert_tex(plugin_data):
    if type(plugin_data) is dict:
        dict_to_dumbo(plugin_data)
        return
    for p in plugin_data:
        pm = p["markup"]
        dict_to_dumbo(pm)


def render_plugin_multi(doc: Document, plugin, plugin_data, params=None,
                        plugin_output_format: PluginOutputFormat = PluginOutputFormat.HTML):
    if params is not None:
        for p in plugin_data:
            p.update(params)

    if doc.get_settings().plugin_md():
        if plugin_output_format == PluginOutputFormat.HTML:
            convert_md(plugin_data)
        else:
            convert_tex(plugin_data)

    return call_plugin_generic(plugin,
                               'post',
                               ('multimd' if plugin_output_format == PluginOutputFormat.MD else 'multihtml'),
                               data=json.dumps(plugin_data, cls=TimJsonEncoder),
                               headers={'Content-type': 'application/json'},
                               params=params)


def call_plugin_resource(plugin, filename, args=None):
    try:
        plug = get_plugin(plugin)
        request = requests.get(plug['host'] + filename, timeout=5, stream=True, params=args)
        request.encoding = 'utf-8'
        return request
    except requests.exceptions.Timeout:
        raise PluginException("Could not connect to plugin: " + plugin)


def call_plugin_answer(plugin, answer_data):
    return call_plugin_generic(plugin,
                               'put',
                               'answer',
                               json.dumps(answer_data, cls=TimJsonEncoder),
                               headers={'Content-type': 'application/json'})


# Get lists of js and css files required by plugin, as well as list of Angular modules they define.
@lru_cache(maxsize=100)
def plugin_reqs(plugin):
    return call_plugin_generic(plugin, 'get', 'reqs')


# Gets plugin info (host)
def get_plugin(plugin):
    if plugin in PLUGINS:
        return PLUGINS[plugin]
    raise PluginException("Plugin does not exist.")


# Get address towards which the plugin must send its further requests, such as answers
def get_plugin_tim_url(plugin):
    if plugin in PLUGINS:
        return TIM_URL + "/" + plugin
    raise PluginException("Plugin does not exist.")


def get_plugin_needs_browser(plugin):
    # if not plugin: return False
    plg = get_plugin(plugin)
    if "browser" not in plg:
        return True
    return plg["browser"] != False
